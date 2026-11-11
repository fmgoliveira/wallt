import type { DatabaseSync } from "node:sqlite";
import { SYNC_TABLES, type SyncTable } from "@wallt/sync";
import { beforeEach, describe, expect, it } from "vitest";
import { DataImportError, type ExportBundle, parseBundle, tableToCsv } from "../data-port";
import { seedDefaultCategories } from "../seed";
import { createTestRepository } from "./test-utils";

async function fill(repo: Awaited<ReturnType<typeof createTestRepository>>["repo"]) {
  const checking = await repo.accounts.create({
    name: "Checking",
    type: "checking",
    currency: "EUR",
    openingBalance: 100_000,
  });
  const savings = await repo.accounts.create({
    name: 'Savings, "main"',
    type: "savings",
    currency: "EUR",
    openingBalance: 0,
  });
  const food = await repo.categories.create({ name: "Food", type: "expense" });
  const tag = await repo.tags.create({ name: "Trip", color: "#112233" });
  await repo.transactions.create({
    accountId: checking.id,
    amount: -1000,
    currency: "EUR",
    bookingDate: "2026-11-01",
    payee: "Corner Market",
    categoryId: food.id,
    tagIds: [tag.id],
  });
  await repo.transactions.create({
    accountId: savings.id,
    amount: -900,
    currency: "EUR",
    bookingDate: "2026-11-02",
    payee: "Line\nbreak",
    splits: [{ amount: -600, categoryId: food.id }, { amount: -300 }],
  });
  await repo.budgets.create({
    name: "Groceries",
    period: "month",
    start: "2026-11-01",
    amount: 30_000,
    currency: "EUR",
    scope: { categoryIds: [food.id], tagIds: [], accountIds: [] },
  });
  await repo.goals.create({
    name: "Holiday",
    targetAmount: 200_000,
    currency: "EUR",
    accountIds: [savings.id],
  });
  await repo.rules.create({
    name: "Market",
    conditions: [{ field: "payee", op: "contains", value: "market" }],
    action: { categoryId: food.id },
  });
  await repo.payeeAliases.create({ pattern: "CORNER MKT", payee: "Corner Market" });
}

/** Rows without per-device plumbing, so two ledgers can be compared. */
function content(bundle: ExportBundle) {
  const out = {} as Record<SyncTable, unknown[]>;
  for (const table of SYNC_TABLES) {
    out[table] = bundle.tables[table].map((r) => {
      const { user_id: _u, server_seq: _s, hlc: _h, updated_at: _t, ...rest } = r;
      return rest;
    });
  }
  return out;
}

let source: Awaited<ReturnType<typeof createTestRepository>>;
beforeEach(async () => {
  source = await createTestRepository();
  await fill(source.repo);
});

describe("export -> import round trip", () => {
  it("restores every entity into an empty ledger", async () => {
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    expect(bundle.tables.transactions).toHaveLength(2);
    expect(bundle.tables.transaction_splits.length).toBeGreaterThan(0);
    // survives being written to a file and read back
    const fromFile = JSON.parse(JSON.stringify(bundle));

    const target = await createTestRepository({ userId: "user-2" });
    const { rows } = await target.repo.data.importBundle(fromFile, "user-2");
    expect(rows).toBeGreaterThan(10);

    const again = await target.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    expect(content(again)).toEqual(content(bundle));
    // owned by the importing user and queued to sync
    expect(again.tables.accounts.every((a) => a.user_id === "user-2")).toBe(true);
    expect(again.tables.accounts.every((a) => a.server_seq === null)).toBe(true);
    const queued = target.raw.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number };
    expect(queued.n).toBeGreaterThan(0);
    // balances derive from the restored rows
    const accounts = await target.repo.accounts.listWithBalances();
    expect(accounts.find((a) => a.name === "Checking")?.balance).toBe(99_000);
  });

  it("merges the device's default categories with the restored ones", async () => {
    let n = 0;
    const seed = (raw: DatabaseSync, tag: string) =>
      seedDefaultCategories(
        {
          all: async (sql, params = []) => raw.prepare(sql).all(...(params as never[])) as never[],
          run: async (sql, params = []) => void raw.prepare(sql).run(...(params as never[])),
          transaction: async (fn) => fn(),
        },
        {
          userId: "local",
          newId: () => `0190a5c4-7b1e-7a3f-8c2d-${tag}${String(++n).padStart(11, "0")}`,
          now: "2026-01-01T00:00:00.000Z",
          hlc: `h${n}`,
        },
      );
    expect(await seed(source.raw, "a")).toBeGreaterThan(0);
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    const target = await createTestRepository();
    expect(await seed(target.raw, "b")).toBeGreaterThan(0); // the new device's own copies, other ids
    await target.repo.data.importBundle(bundle, "local");
    const keys = (await target.repo.categories.list())
      .filter((c) => c.systemKey)
      .map((c) => c.systemKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses a ledger that already has data", async () => {
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    await expect(source.repo.data.importBundle(bundle, "local")).rejects.toMatchObject({
      code: "notEmpty",
    });
  });

  it("refuses other files and newer bundles", async () => {
    const target = await createTestRepository();
    await expect(target.repo.data.importBundle({ hello: 1 }, "local")).rejects.toBeInstanceOf(
      DataImportError,
    );
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    await expect(
      target.repo.data.importBundle({ ...bundle, schemaVersion: 999 }, "local"),
    ).rejects.toMatchObject({ code: "newer" });
    expect(() => parseBundle({ ...bundle, tables: { ...bundle.tables, nope: [] } })).toThrow(
      DataImportError,
    );
  });

  it("rejects a malformed row and leaves the ledger untouched", async () => {
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    const broken = structuredClone(bundle);
    (broken.tables.transactions[0] as Record<string, unknown>).amount = "ten";
    const target = await createTestRepository();
    await expect(target.repo.data.importBundle(broken, "local")).rejects.toMatchObject({
      code: "invalid",
    });
    expect(await target.repo.accounts.list()).toHaveLength(0);
  });
});

describe("csv", () => {
  it("writes a header, escapes quotes, commas and line breaks, and hides sync plumbing", async () => {
    const bundle = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    const accounts = tableToCsv("accounts", bundle.tables.accounts);
    expect(accounts.startsWith("﻿id,")).toBe(true);
    expect(accounts).not.toMatch(/user_id|hlc|server_seq|deleted_at/);
    expect(accounts).toContain('"Savings, ""main"""');
    const txs = tableToCsv("transactions", bundle.tables.transactions);
    expect(txs).toContain('"Line\nbreak"');
    expect(txs).toContain("-1000");
  });
});

describe("eraseAll", () => {
  it("tombstones every row, queues them for sync and leaves nothing live", async () => {
    const before = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    const total = SYNC_TABLES.reduce((n, t) => n + before.tables[t].length, 0);
    expect(await source.repo.data.eraseAll()).toBe(total);
    const after = await source.repo.data.exportBundle("2026-11-11T00:00:00.000Z");
    expect(SYNC_TABLES.every((t) => after.tables[t].length === 0)).toBe(true);
    expect(await source.repo.accounts.list()).toHaveLength(0);
    const queued = source.raw
      .prepare("SELECT COUNT(DISTINCT row_id) AS n FROM outbox WHERE table_name = 'transactions'")
      .get() as { n: number };
    expect(queued.n).toBe(2);
    // a second run finds nothing to delete
    expect(await source.repo.data.eraseAll()).toBe(0);
  });
});
