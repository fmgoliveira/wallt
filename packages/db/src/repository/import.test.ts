import { describe, expect, it } from "vitest";
import { createTestRepository } from "./test-utils";

const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;
const BATCH = "0190a5c4-7b1e-7a3f-8c2d-000000000001";

async function setup() {
  const { repo, raw } = await createTestRepository();
  const a = await repo.accounts.create({ name: "Current", ...eur });
  const b = await repo.accounts.create({ name: "Savings", ...eur });
  return { repo, raw, a, b };
}

const tx = (accountId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  accountId,
  amount,
  currency: "EUR",
  bookingDate: "2024-01-10",
  ...extra,
});

describe("imported transactions", () => {
  it("keep source, ids, hash, batch and the review flag", async () => {
    const { repo, a } = await setup();
    const created = await repo.transactions.create(
      tx(a.id, -500, {
        source: "import",
        externalId: "F1",
        dedupHash: "abc",
        importBatchId: BATCH,
        needsReview: true,
      }),
    );
    expect(created).toMatchObject({
      source: "import",
      externalId: "F1",
      dedupHash: "abc",
      importBatchId: BATCH,
      categorization: { needsReview: true },
    });
    expect(await repo.transactions.count({ needsReview: true })).toBe(1);
  });
});

describe("linkTransfer", () => {
  it("links two existing rows as the legs of a transfer", async () => {
    const { repo, a, b } = await setup();
    const out = await repo.transactions.create(tx(a.id, -5000));
    const inn = await repo.transactions.create(tx(b.id, 5000));
    const [from, to] = await repo.transactions.linkTransfer(inn.id, out.id);
    expect(from).toMatchObject({
      id: out.id,
      kind: "transfer",
      transferPeerId: inn.id,
      categoryId: null,
    });
    expect(to).toMatchObject({ id: inn.id, kind: "transfer", transferPeerId: out.id });
    // balances are untouched by linking
    expect((await repo.accounts.getWithBalance(a.id))?.balance).toBe(-5000);
  });

  it("refuses mismatches", async () => {
    const { repo, a, b } = await setup();
    const out = await repo.transactions.create(tx(a.id, -5000));
    const same = await repo.transactions.create(tx(a.id, 5000));
    const other = await repo.transactions.create(tx(b.id, 4000));
    await expect(repo.transactions.linkTransfer(out.id, same.id)).rejects.toThrow(
      /different accounts/,
    );
    await expect(repo.transactions.linkTransfer(out.id, other.id)).rejects.toThrow(/opposite/);
    await expect(repo.transactions.linkTransfer(out.id, out.id)).rejects.toThrow();
  });
});

describe("deleteImportBatch", () => {
  it("removes exactly the batch and nothing else", async () => {
    const { repo, a } = await setup();
    await repo.transactions.create(tx(a.id, -100, { importBatchId: BATCH }));
    await repo.transactions.create(tx(a.id, -200, { importBatchId: BATCH }));
    const keep = await repo.transactions.create(tx(a.id, -300));
    expect(await repo.transactions.deleteImportBatch(BATCH)).toBe(2);
    expect((await repo.transactions.list({})).map((t) => t.id)).toEqual([keep.id]);
    expect(await repo.transactions.deleteImportBatch(BATCH)).toBe(0); // idempotent
  });

  it("keeps the other account's row when an imported row was linked to it", async () => {
    const { repo, a, b } = await setup();
    const imported = await repo.transactions.create(tx(a.id, -5000, { importBatchId: BATCH }));
    const existing = await repo.transactions.create(tx(b.id, 5000));
    await repo.transactions.linkTransfer(imported.id, existing.id);
    expect(await repo.transactions.deleteImportBatch(BATCH)).toBe(1);
    const left = await repo.transactions.get(existing.id);
    expect(left).toMatchObject({ kind: "income", transferPeerId: null, amount: 5000 });
    expect(await repo.transactions.get(imported.id)).toBeNull();
  });

  it("removes both legs when both belong to the batch", async () => {
    const { repo, a, b } = await setup();
    const x = await repo.transactions.create(tx(a.id, -5000, { importBatchId: BATCH }));
    const y = await repo.transactions.create(tx(b.id, 5000, { importBatchId: BATCH }));
    await repo.transactions.linkTransfer(x.id, y.id);
    expect(await repo.transactions.deleteImportBatch(BATCH)).toBe(2);
    expect(await repo.transactions.list({})).toEqual([]);
  });

  it("drops splits and tags of removed rows", async () => {
    const { repo, a, raw } = await setup();
    const cat = await repo.categories.create({ name: "c", type: "expense" });
    const tag = await repo.tags.create({ name: "t" });
    await repo.transactions.create(
      tx(a.id, -1000, {
        importBatchId: BATCH,
        tagIds: [tag.id],
        splits: [
          { amount: -400, categoryId: cat.id },
          { amount: -600, categoryId: cat.id },
        ],
      }),
    );
    await repo.transactions.deleteImportBatch(BATCH);
    const live = (table: string) =>
      (
        raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL`).get() as {
          n: number;
        }
      ).n;
    expect(live("transaction_splits")).toBe(0);
    expect(live("transaction_tags")).toBe(0);
  });
});

describe("importProfiles", () => {
  const config = { headerRow: 3, columns: { date: 0, description: 1, amount: 2 } };

  it("round-trips fingerprints and config, sorted by name, outbox-queued", async () => {
    const { repo, raw, a } = await setup();
    raw.exec("DELETE FROM outbox");
    const z = await repo.importProfiles.create({
      name: "Zeta bank",
      fingerprints: ["aaaa1111"],
      config,
      defaultAccountId: a.id,
    });
    await repo.importProfiles.create({
      name: "Alpha bank",
      fingerprints: ["bbbb2222", "cccc3333"],
      config,
    });
    expect((await repo.importProfiles.list()).map((p) => p.name)).toEqual([
      "Alpha bank",
      "Zeta bank",
    ]);
    expect(await repo.importProfiles.get(z.id)).toMatchObject({
      config,
      defaultAccountId: a.id,
      institution: null,
    });
    const queued = raw.prepare("SELECT table_name FROM outbox").all() as { table_name: string }[];
    expect(queued.every((q) => q.table_name === "import_profiles")).toBe(true);
    expect(queued).toHaveLength(2);
  });

  it("updates (e.g. adds a fingerprint), validates and soft-deletes", async () => {
    const { repo } = await setup();
    const p = await repo.importProfiles.create({ name: "Bank", fingerprints: ["f1"], config });
    const next = await repo.importProfiles.update(p.id, {
      fingerprints: ["f1", "f2"],
      name: "Bank (new)",
    });
    expect(next.fingerprints).toEqual(["f1", "f2"]);
    await expect(repo.importProfiles.update(p.id, { name: " " })).rejects.toThrow();
    await expect(
      repo.importProfiles.update(p.id, {
        defaultAccountId: "0190a5c4-7b1e-7a3f-8c2d-0000000000ff",
      }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      repo.importProfiles.create({ name: "x", fingerprints: [], config }),
    ).rejects.toThrow();
    await repo.importProfiles.delete(p.id);
    expect(await repo.importProfiles.get(p.id)).toBeNull();
    expect(await repo.importProfiles.list()).toEqual([]);
    await expect(repo.importProfiles.delete(p.id)).rejects.toThrow();
  });
});
