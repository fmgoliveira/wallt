import { MAX_PUSH_ATTEMPTS, SYNC_TABLES, type SyncRow, type SyncTable } from "@wallt/sync";
import { getTableColumns, getTableName } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { migrations } from "../migrations.generated";
import { outboxTriggerStatements } from "../outbox-triggers";
import { createTestRepository } from "../repository/test-utils";
import * as schema from "../schema";
import { SYNC_TABLE_DEFS, syncColumns, validateSyncRow } from "./tables";

type Outbox = { table_name: string; row_id: string; op: string; hlc: string; attempts: number };
const outbox = (raw: import("node:sqlite").DatabaseSync) =>
  raw.prepare("SELECT * FROM outbox ORDER BY id").all() as unknown as Outbox[];
const row = (raw: import("node:sqlite").DatabaseSync, table: string, id: string) =>
  raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as unknown as SyncRow;

const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;

describe("synced table registry", () => {
  it("covers exactly the schema tables that carry server_seq", () => {
    const synced = (Object.values(schema) as unknown[])
      .filter((v): v is SQLiteTable => v instanceof SQLiteTable)
      .filter((t) => "serverSeq" in getTableColumns(t))
      .map((t) => getTableName(t))
      .sort();
    expect(synced).toEqual([...SYNC_TABLES].sort());
    for (const name of SYNC_TABLES) expect(getTableName(SYNC_TABLE_DEFS[name])).toBe(name);
  });

  it("freezes the outbox triggers of every synced table into migration 0002", () => {
    const m = migrations.find((x) => x.tag.startsWith("0002_"));
    expect(m).toBeDefined();
    const triggers = (m?.statements ?? []).filter((s) => s.startsWith("CREATE TRIGGER"));
    expect(triggers).toEqual(outboxTriggerStatements());
  });
});

describe("outbox triggers", () => {
  it("queue a local create, coalesce edits and mark deletes", async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    expect(outbox(raw)).toMatchObject([{ table_name: "accounts", row_id: a.id, op: "put" }]);

    const edited = await repo.accounts.update(a.id, { name: "B" });
    const q = outbox(raw);
    expect(q).toHaveLength(1);
    expect(q[0]?.hlc).toBe(edited.hlc);

    await repo.accounts.delete(a.id);
    expect(outbox(raw)).toMatchObject([{ row_id: a.id, op: "delete" }]);
  });

  it("queue every row a transaction touches (splits, tag links, both transfer legs)", async () => {
    const { repo, raw } = await createTestRepository();
    const acc = await repo.accounts.create({ name: "A", ...eur });
    const acc2 = await repo.accounts.create({ name: "B", ...eur });
    const tag = await repo.tags.create({ name: "t" });
    const cat = await repo.categories.create({ name: "c", type: "expense" });
    raw.exec("DELETE FROM outbox");
    const tx = await repo.transactions.create({
      accountId: acc.id,
      amount: -1000,
      currency: "EUR",
      bookingDate: "2026-11-01",
      tagIds: [tag.id],
      splits: [
        { amount: -400, categoryId: cat.id },
        { amount: -600, categoryId: cat.id },
      ],
    });
    const tables = outbox(raw).map((e) => e.table_name);
    expect(tables.filter((t) => t === "transactions")).toHaveLength(1);
    expect(tables.filter((t) => t === "transaction_splits")).toHaveLength(2);
    expect(tables.filter((t) => t === "transaction_tags")).toHaveLength(1);

    raw.exec("DELETE FROM outbox");
    const [out, inn] = await repo.transactions.createTransfer({
      fromAccountId: acc.id,
      toAccountId: acc2.id,
      amount: 500,
      bookingDate: "2026-11-02",
    });
    const ids = outbox(raw).map((e) => e.row_id);
    expect(ids).toContain(out.id);
    expect(ids).toContain(inn.id);
    expect(tx.id).toBeTruthy();
  });

  it("do not queue while the outbox is suspended", async () => {
    const { repo, raw } = await createTestRepository();
    await repo.accounts.create({ name: "A", ...eur });
    raw.exec("DELETE FROM outbox");
    raw.exec("INSERT INTO sync_meta (key, value) VALUES ('outbox_suspended', '1')");
    await repo.accounts.create({ name: "B", ...eur });
    expect(outbox(raw)).toEqual([]);
  });
});

describe("SyncStore", () => {
  it("pending returns the current row state, oldest first", async () => {
    const { repo } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    const b = await repo.accounts.create({ name: "B", ...eur });
    await repo.accounts.update(a.id, { name: "A2" });
    const changes = await repo.sync.pending(10);
    expect(changes.map((c) => c.id)).toEqual([a.id, b.id]); // an edit coalesces into the existing entry
    expect(changes.find((c) => c.id === a.id)?.row.name).toBe("A2");
    expect(await repo.sync.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it("acknowledge stamps server_seq and clears sent entries, keeping ones edited meanwhile", async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    const b = await repo.accounts.create({ name: "B", ...eur });
    const pushed = await repo.sync.pending(10);
    const edited = await repo.accounts.update(b.id, { name: "B2" }); // edited while the push was in flight
    await repo.sync.acknowledge(pushed, {
      accepted: pushed.map((c, i) => ({ table: c.table, id: c.id, hlc: c.hlc, serverSeq: i + 1 })),
      rejected: [],
      schemaVersion: 1,
    });
    expect(row(raw, "accounts", a.id).server_seq).toBe(1);
    // b's row moved on: its seq is not stamped and its entry stays for the next push
    expect(row(raw, "accounts", b.id).server_seq).toBeNull();
    expect(outbox(raw)).toMatchObject([{ row_id: b.id, hlc: edited.hlc }]);
  });

  it("a stale rejection replaces our row with the server's and clears the entry", async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "mine", ...eur });
    const [sent] = await repo.sync.pending(10);
    if (!sent) throw new Error("expected a change");
    const current = {
      ...sent.row,
      name: "theirs",
      hlc: `${"f".repeat(12)}-0000-other`,
      server_seq: 9,
    };
    await repo.sync.acknowledge([sent], {
      accepted: [],
      rejected: [{ table: "accounts", id: a.id, hlc: sent.hlc, reason: "stale", current }],
      schemaVersion: 1,
    });
    expect(row(raw, "accounts", a.id).name).toBe("theirs");
    expect(outbox(raw)).toEqual([]);
  });

  it("parks entries the server keeps refusing", async () => {
    const { repo } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    for (let i = 0; i < MAX_PUSH_ATTEMPTS; i++) {
      const [c] = await repo.sync.pending(10);
      if (!c) throw new Error("entry parked too early");
      await repo.sync.acknowledge([c], {
        accepted: [],
        rejected: [{ table: "accounts", id: a.id, hlc: c.hlc, reason: "invalid" }],
        schemaVersion: 1,
      });
    }
    expect(await repo.sync.pending(10)).toEqual([]);
    expect(await repo.sync.counts()).toEqual({ pending: 0, failed: 1 });
    // a new local edit revives it
    await repo.accounts.update(a.id, { name: "fixed" });
    expect(await repo.sync.counts()).toEqual({ pending: 1, failed: 0 });
  });

  it("applyPulled upserts without queueing, moves the cursor and obeys last-writer-wins", async () => {
    const { repo, raw } = await createTestRepository({ nodeId: "mine" });
    const a = await repo.accounts.create({ name: "mine", ...eur });
    raw.exec("DELETE FROM outbox");
    const base = row(raw, "accounts", a.id);
    const newer = { ...base, name: "remote", hlc: `${"f".repeat(12)}-0000-other`, server_seq: 4 };
    const older = { ...base, name: "ancient", hlc: `${"0".repeat(12)}-0000-other`, server_seq: 5 };
    const fresh = {
      ...base,
      id: "00000000-0000-7000-8000-000000000001",
      name: "new",
      server_seq: 6,
    };

    const r1 = await repo.sync.applyPulled([{ table: "accounts", row: older }], 5);
    expect(r1.applied).toBe(0);
    const r2 = await repo.sync.applyPulled(
      [
        { table: "accounts", row: newer },
        { table: "accounts", row: fresh },
      ],
      6,
    );
    expect(r2.applied).toBe(2);
    expect(row(raw, "accounts", a.id).name).toBe("remote");
    expect(row(raw, "accounts", fresh.id).name).toBe("new");
    expect(outbox(raw)).toEqual([]);
    expect(await repo.sync.getCursor()).toBe(6);
    expect(
      raw.prepare("SELECT 1 FROM sync_meta WHERE key = 'outbox_suspended'").get(),
    ).toBeUndefined();
  });

  it("a pulled winner drops our queued version of the same row", async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "mine", ...eur });
    expect(outbox(raw)).toHaveLength(1);
    const remote = {
      ...row(raw, "accounts", a.id),
      name: "theirs",
      hlc: `${"f".repeat(12)}-0000-o`,
    };
    await repo.sync.applyPulled([{ table: "accounts", row: remote }], 1);
    expect(outbox(raw)).toEqual([]);
  });

  it("a user-chosen category survives a newer classifier write", async () => {
    const { repo, raw } = await createTestRepository();
    const acc = await repo.accounts.create({ name: "A", ...eur });
    const cat = await repo.categories.create({ name: "c", type: "expense" });
    const tx = await repo.transactions.create({
      accountId: acc.id,
      amount: -100,
      currency: "EUR",
      bookingDate: "2026-11-01",
      categoryId: cat.id,
    });
    const local = row(raw, "transactions", tx.id);
    expect(local.categorization_method).toBe("user");
    const ml = {
      ...local,
      category_id: null,
      categorization_method: "ml",
      hlc: `${"f".repeat(12)}-0000-o`,
    };
    await repo.sync.applyPulled([{ table: "transactions", row: ml }], 1);
    expect(row(raw, "transactions", tx.id).category_id).toBe(cat.id);
  });

  it("maxHlc finds the highest stored clock value", async () => {
    const { repo } = await createTestRepository();
    expect(await repo.sync.maxHlc()).toBe("");
    await repo.accounts.create({ name: "A", ...eur });
    const b = await repo.accounts.create({ name: "B", ...eur });
    expect(await repo.sync.maxHlc()).toBe(b.hlc);
  });

  it("enroll re-stamps every row to the server user and queues all of them", async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    await repo.categories.create({ name: "c", type: "expense" });
    raw.exec("DELETE FROM outbox"); // rows that existed before sync was switched on
    expect(await repo.sync.enroll("user-1")).toBe(2);
    expect(row(raw, "accounts", a.id).user_id).toBe("user-1");
    expect(outbox(raw)).toHaveLength(2);
    expect(await repo.sync.enroll("user-1")).toBe(0); // idempotent
  });
});

describe("validateSyncRow", () => {
  const table: SyncTable = "accounts";
  const good = async () => {
    const { repo, raw } = await createTestRepository();
    const a = await repo.accounts.create({ name: "A", ...eur });
    return row(raw, table, a.id);
  };

  it("accepts a real row and rejects unknown, missing and mistyped columns", async () => {
    const r = await good();
    expect(validateSyncRow(table, r)).toBeNull();
    expect(validateSyncRow(table, { ...r, extra: 1 })).toMatch(/unknown column/);
    const { name: _n, ...noName } = r;
    expect(validateSyncRow(table, noName)).toMatch(/missing column name/);
    expect(validateSyncRow(table, { ...r, name: null })).toMatch(/must not be null/);
    expect(validateSyncRow(table, { ...r, opening_balance: 1.5 })).toMatch(/integer/);
    expect(validateSyncRow(table, { ...r, archived: 2 })).toMatch(/0 or 1/);
    expect(validateSyncRow(table, { ...r, name: 5 })).toMatch(/text/);
  });

  it("knows every column of every synced table", () => {
    for (const t of SYNC_TABLES) {
      const names = syncColumns(t).map((c) => c.name);
      for (const common of [
        "id",
        "user_id",
        "created_at",
        "updated_at",
        "hlc",
        "deleted_at",
        "server_seq",
      ]) {
        expect(names).toContain(common);
      }
    }
  });
});

describe("enroll guard", () => {
  it("refuses to take over rows that belong to another account", async () => {
    const { repo, raw } = await createTestRepository();
    await repo.accounts.create({ name: "A", ...eur });
    await repo.sync.enroll("user-1");
    await expect(repo.sync.enroll("user-2")).rejects.toThrow(/another account/);
    expect(raw.prepare("SELECT DISTINCT user_id FROM accounts").all()).toEqual([
      { user_id: "user-1" },
    ]);
  });
});

describe("dedupeSystemCategories", () => {
  async function duplicated() {
    const { repo, raw, stamper } = await createTestRepository();
    // two devices each seeded "Home" + "Rent" (same system keys, different ids)
    const homeA = await repo.categories.create({
      name: "Home",
      type: "expense",
      systemKey: "home",
    });
    const homeB = await repo.categories.create({
      name: "Home",
      type: "expense",
      systemKey: "home",
    });
    const rentA = await repo.categories.create({
      name: "Rent",
      type: "expense",
      parentId: homeA.id,
      systemKey: "rent",
    });
    const rentB = await repo.categories.create({
      name: "Rent",
      type: "expense",
      parentId: homeB.id,
      systemKey: "rent",
    });
    return { repo, raw, stamper, homeA, homeB, rentA, rentB };
  }
  const stampOf = (s: { now(): string; hlc(): string }) => () => ({ now: s.now(), hlc: s.hlc() });

  it("keeps the earliest copy, moves references and tombstones the rest", async () => {
    const { repo, raw, stamper, homeA, homeB, rentA, rentB } = await duplicated();
    const acc = await repo.accounts.create({ name: "A", ...eur });
    await repo.transactions.create({
      accountId: acc.id,
      amount: -500,
      currency: "EUR",
      bookingDate: "2026-11-01",
      categoryId: rentB.id,
    });
    const budget = await repo.budgets.create({
      name: "Home",
      period: "month",
      start: "2026-11-01",
      amount: 10000,
      currency: "EUR",
      rollover: false,
      scope: { categoryIds: [homeA.id, homeB.id], tagIds: [], accountIds: [] },
    });
    raw.exec("DELETE FROM outbox");

    expect(await repo.sync.dedupeSystemCategories(stampOf(stamper))).toBe(2);

    const live = (await repo.categories.list({ includeArchived: true })).map((c) => c.id).sort();
    expect(live).toEqual([homeA.id, rentA.id].sort());
    expect((await repo.categories.get(rentA.id))?.parentId).toBe(homeA.id);
    const [tx] = await repo.transactions.list({});
    expect(tx?.categoryId).toBe(rentA.id);
    const b = (await repo.budgets.list()).find((x) => x.id === budget.id);
    expect(b?.scope.categoryIds).toEqual([homeA.id]);
    // everything touched is queued, so the merge reaches the server
    const queued = outbox(raw).map((o) => o.row_id);
    expect(queued).toEqual(expect.arrayContaining([homeB.id, rentB.id, tx?.id, budget.id]));
  });

  it("is idempotent, and re-points late references to an already merged copy", async () => {
    const { repo, raw, stamper, rentA, rentB } = await duplicated();
    const acc = await repo.accounts.create({ name: "A", ...eur });
    await repo.sync.dedupeSystemCategories(stampOf(stamper));
    expect(await repo.sync.dedupeSystemCategories(stampOf(stamper))).toBe(0);
    // an offline device pushes a transaction that still names the merged-away copy
    const tx = await repo.transactions.create({
      accountId: acc.id,
      amount: -100,
      currency: "EUR",
      bookingDate: "2026-11-02",
    });
    raw.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(rentB.id, tx.id);
    expect(await repo.sync.dedupeSystemCategories(stampOf(stamper))).toBe(0);
    expect((await repo.transactions.get(tx.id))?.categoryId).toBe(rentA.id);
  });
});
