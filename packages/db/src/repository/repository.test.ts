import type { DatabaseSync } from "node:sqlite";
import { idSchema } from "@wallt/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestRepository } from "./test-utils";
import { type Repository, RepositoryError } from "./types";

let repo: Repository;
let raw: DatabaseSync;

beforeEach(async () => {
  ({ repo, raw } = await createTestRepository());
});

const account = (over: Record<string, unknown> = {}) =>
  repo.accounts.create({
    name: "Checking",
    type: "checking",
    currency: "EUR",
    openingBalance: 100_000,
    ...over,
  });

const expectCode = async (p: Promise<unknown>, code: RepositoryError["code"]) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RepositoryError);
  expect((err as RepositoryError).code).toBe(code);
};

describe("accounts", () => {
  it("creates with defaults and stamps the sync columns", async () => {
    const a = await account({ color: "#336699" });
    expect(idSchema.safeParse(a.id).success).toBe(true);
    expect(a).toMatchObject({
      userId: "local",
      archived: false,
      includeInNetWorth: true,
      sortOrder: 0,
      color: "#336699",
      deletedAt: null,
      serverSeq: null,
      openingBalance: 100_000,
    });
    expect(a.hlc).toMatch(/-test$/);
    expect(a.createdAt).toBe(a.updatedAt);
    expect((await account({ name: "Savings" })).sortOrder).toBe(1);
  });

  it("lists active accounts in sort order, hiding archived and deleted ones", async () => {
    const a = await account({ name: "B" });
    const b = await account({ name: "A", sortOrder: 5 });
    const c = await account({ name: "Old", archived: true });
    const d = await account({ name: "Gone" });
    await repo.accounts.delete(d.id);
    expect((await repo.accounts.list()).map((x) => x.name)).toEqual(["B", "A"]);
    expect((await repo.accounts.list({ includeArchived: true })).map((x) => x.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  it("updates, bumping updatedAt and hlc, and validates the result", async () => {
    const a = await account();
    const u = await repo.accounts.update(a.id, { name: "Main", archived: true });
    expect(u).toMatchObject({ name: "Main", archived: true, createdAt: a.createdAt });
    expect(u.updatedAt > a.updatedAt).toBe(true);
    expect(u.hlc > a.hlc).toBe(true);
    await expectCode(repo.accounts.update(a.id, { name: "  " }), "validation");
    await expectCode(repo.accounts.update(a.id, { openingBalance: 1.5 }), "validation");
    await expectCode(repo.accounts.update(a.id, { currency: "eur" }), "validation");
  });

  it("refuses to delete an account that has transactions (archive instead)", async () => {
    const a = await account();
    const t1 = await repo.transactions.create({
      accountId: a.id,
      amount: -1,
      currency: "EUR",
      bookingDate: "2026-11-01",
    });
    await expectCode(repo.accounts.delete(a.id), "validation");
    expect(await repo.accounts.get(a.id)).not.toBeNull();
    await repo.transactions.delete(t1.id);
    await repo.accounts.delete(a.id); // fine once its transactions are gone
    expect(await repo.accounts.get(a.id)).toBeNull();
  });

  it("soft-deletes: the row stays as a tombstone", async () => {
    const a = await account();
    await repo.accounts.delete(a.id);
    expect(await repo.accounts.get(a.id)).toBeNull();
    const row = raw
      .prepare("SELECT deleted_at, updated_at FROM accounts WHERE id = ?")
      .get(a.id) as {
      deleted_at: string;
      updated_at: string;
    };
    expect(row.deleted_at).toBe(row.updated_at);
    await expectCode(repo.accounts.delete(a.id), "not_found");
    await expectCode(repo.accounts.update(a.id, { name: "x" }), "not_found");
  });
});

describe("categories", () => {
  it("enforces a two-level tree of one type", async () => {
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const cafe = await repo.categories.create({ name: "Cafe", type: "expense", parentId: food.id });
    expect(cafe.parentId).toBe(food.id);
    await expectCode(
      repo.categories.create({ name: "Deep", type: "expense", parentId: cafe.id }),
      "validation",
    );
    await expectCode(
      repo.categories.create({ name: "Wage", type: "income", parentId: food.id }),
      "validation",
    );
    await expectCode(
      repo.categories.create({
        name: "Orphan",
        type: "expense",
        parentId: "019e0000-0000-7000-8000-000000000000",
      }),
      "validation",
    );
    await expectCode(repo.categories.update(food.id, { parentId: food.id }), "validation");
    const other = await repo.categories.create({ name: "Other", type: "expense" });
    await expectCode(repo.categories.update(food.id, { parentId: other.id }), "validation"); // has children
  });

  it("orders siblings, filters by type and archived, and re-parents children on delete", async () => {
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const cafe = await repo.categories.create({ name: "Cafe", type: "expense", parentId: food.id });
    const pay = await repo.categories.create({ name: "Pay", type: "income" });
    const hidden = await repo.categories.create({
      name: "Hidden",
      type: "expense",
      archived: true,
    });
    expect((await repo.categories.list({ type: "income" })).map((c) => c.id)).toEqual([pay.id]);
    expect((await repo.categories.list()).map((c) => c.id)).not.toContain(hidden.id);
    expect((await repo.categories.list({ includeArchived: true })).map((c) => c.id)).toContain(
      hidden.id,
    );
    await repo.categories.delete(food.id);
    expect((await repo.categories.get(cafe.id))?.parentId).toBeNull();
    expect(await repo.categories.get(food.id)).toBeNull();
  });
});

describe("tags", () => {
  it("creates, renames and deletes tags, tombstoning their links", async () => {
    const acc = await account();
    const trip = await repo.tags.create({ name: "Trip", color: "#112233" });
    const tx = await repo.transactions.create({
      accountId: acc.id,
      amount: -500,
      currency: "EUR",
      bookingDate: "2026-11-01",
      tagIds: [trip.id],
    });
    expect(tx.tagIds).toEqual([trip.id]);
    expect((await repo.tags.update(trip.id, { name: "Holiday" })).name).toBe("Holiday");
    await repo.tags.delete(trip.id);
    expect(await repo.tags.list()).toEqual([]);
    expect((await repo.transactions.get(tx.id))?.tagIds).toEqual([]);
    await expectCode(repo.tags.update(trip.id, { name: "x" }), "not_found");
  });
});

describe("transactions", () => {
  const base = (accountId: string, over: Record<string, unknown> = {}) => ({
    accountId,
    amount: -1250,
    currency: "EUR",
    bookingDate: "2026-11-03",
    ...over,
  });

  it("creates with sensible defaults", async () => {
    const acc = await account();
    const tx = await repo.transactions.create(base(acc.id, { payee: "Corner Market" }));
    expect(tx).toMatchObject({
      kind: "expense",
      status: "booked",
      source: "manual",
      payee: "Corner Market",
      notes: "",
      categoryId: null,
      excludedFromReports: false,
      transferPeerId: null,
      categorization: { method: "none", confidence: 0, needsReview: false },
      splits: [],
      tagIds: [],
    });
    const inc = await repo.transactions.create(base(acc.id, { amount: 245_000 }));
    expect(inc.kind).toBe("income");
  });

  it("records user categorization when a category is set", async () => {
    const acc = await account();
    const cat = await repo.categories.create({ name: "Food", type: "expense" });
    const tx = await repo.transactions.create(base(acc.id, { categoryId: cat.id }));
    expect(tx.categorization).toEqual({ method: "user", confidence: 1, needsReview: false });
    const cleared = await repo.transactions.update(tx.id, { categoryId: null });
    expect(cleared.categorization.method).toBe("none");
    const set = await repo.transactions.update(tx.id, { categoryId: cat.id });
    expect(set.categorization.method).toBe("user");
  });

  it("rejects bad references, currencies, signs and non-integer money", async () => {
    const acc = await account();
    await expectCode(
      repo.transactions.create(base("019e0000-0000-7000-8000-000000000000")),
      "validation",
    );
    await expectCode(repo.transactions.create(base(acc.id, { currency: "USD" })), "validation");
    await expectCode(
      repo.transactions.create(base(acc.id, { amount: 100, kind: "expense" })),
      "validation",
    );
    await expectCode(
      repo.transactions.create(base(acc.id, { amount: -100, kind: "income" })),
      "validation",
    );
    await expectCode(repo.transactions.create(base(acc.id, { amount: 12.5 })), "validation");
    await expectCode(
      repo.transactions.create(base(acc.id, { bookingDate: "2026-02-30" })),
      "validation",
    );
    await expectCode(
      repo.transactions.create(
        base(acc.id, { categoryId: "019e0000-0000-7000-8000-000000000000" }),
      ),
      "validation",
    );
    await expectCode(
      repo.transactions.create(base(acc.id, { tagIds: ["019e0000-0000-7000-8000-000000000000"] })),
      "validation",
    );
    expect(await repo.transactions.count()).toBe(0); // nothing half-written
  });

  it("stores splits that add up exactly, and replaces them on update", async () => {
    const acc = await account();
    const a = await repo.categories.create({ name: "A", type: "expense" });
    const b = await repo.categories.create({ name: "B", type: "expense" });
    await expectCode(
      repo.transactions.create(
        base(acc.id, { amount: -1000, splits: [{ amount: -600 }, { amount: -300 }] }),
      ),
      "validation",
    );
    const tx = await repo.transactions.create(
      base(acc.id, {
        amount: -1000,
        splits: [
          { amount: -600, categoryId: a.id, note: "x" },
          { amount: -400, categoryId: b.id },
        ],
      }),
    );
    expect(tx.splits.map((s) => s.amount)).toEqual([-600, -400]);
    const changed = await repo.transactions.update(tx.id, {
      splits: [{ amount: -1000, categoryId: a.id }],
    });
    expect(changed.splits.map((s) => s.amount)).toEqual([-1000]);
    // changing the amount without touching splits must keep them consistent
    await expectCode(repo.transactions.update(tx.id, { amount: -900 }), "validation");
    const cleared = await repo.transactions.update(tx.id, { amount: -900, splits: [] });
    expect(cleared.splits).toEqual([]);
    expect(
      (
        raw
          .prepare("SELECT count(*) AS n FROM transaction_splits WHERE deleted_at IS NOT NULL")
          .get() as {
          n: number;
        }
      ).n,
    ).toBe(3); // tombstoned, not removed
  });

  it("syncs tag links on update without duplicating or resurrecting rows", async () => {
    const acc = await account();
    const t1 = await repo.tags.create({ name: "t1" });
    const t2 = await repo.tags.create({ name: "t2" });
    const tx = await repo.transactions.create(base(acc.id, { tagIds: [t1.id] }));
    const both = await repo.transactions.update(tx.id, { tagIds: [t1.id, t2.id] });
    expect(new Set(both.tagIds)).toEqual(new Set([t1.id, t2.id]));
    const only2 = await repo.transactions.update(tx.id, { tagIds: [t2.id] });
    expect(only2.tagIds).toEqual([t2.id]);
    const again = await repo.transactions.update(tx.id, { tagIds: [t2.id] });
    expect(again.tagIds).toEqual([t2.id]);
    const live = raw
      .prepare("SELECT count(*) AS n FROM transaction_tags WHERE deleted_at IS NULL")
      .get() as { n: number };
    expect(live.n).toBe(1);
  });

  it("filters, searches, sorts and paginates", async () => {
    const a1 = await account({ name: "A1" });
    const a2 = await account({ name: "A2" });
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const tag = await repo.tags.create({ name: "x" });
    const mk = (accountId: string, over: Record<string, unknown>) =>
      repo.transactions.create(base(accountId, over));
    const t1 = await mk(a1.id, {
      bookingDate: "2026-11-01",
      amount: -1000,
      payee: "Corner Market",
      categoryId: food.id,
    });
    const t2 = await mk(a1.id, {
      bookingDate: "2026-11-05",
      amount: 250_000,
      payee: "Acme Payroll",
      tagIds: [tag.id],
    });
    const t3 = await mk(a2.id, {
      bookingDate: "2026-10-20",
      amount: -300,
      notes: "100% cotton_shirt",
    });
    const t4 = await mk(a2.id, { bookingDate: "2026-11-05", amount: -50, status: "pending" });

    const ids = async (f = {}) => (await repo.transactions.list(f)).map((t) => t.id);
    expect(await ids()).toEqual([t4.id, t2.id, t1.id, t3.id]); // date desc, then newest created
    expect(await ids({ accountIds: [a2.id] })).toEqual([t4.id, t3.id]);
    expect(await ids({ categoryIds: [food.id] })).toEqual([t1.id]);
    expect(await ids({ tagIds: [tag.id] })).toEqual([t2.id]);
    expect(await ids({ kind: "income" })).toEqual([t2.id]);
    expect(await ids({ status: "pending" })).toEqual([t4.id]);
    expect(await ids({ from: "2026-11-01", to: "2026-11-05" })).toEqual([t4.id, t2.id, t1.id]);
    expect(await ids({ minAmount: -1000, maxAmount: -300 })).toEqual([t1.id, t3.id]);
    expect(await ids({ search: "market" })).toEqual([t1.id]);
    expect(await ids({ search: "100%" })).toEqual([t3.id]); // % is literal
    expect(await ids({ search: "cotton_" })).toEqual([t3.id]); // _ is literal
    expect(await ids({ search: "co_ton" })).toEqual([]);
    expect(await ids({ limit: 2 })).toEqual([t4.id, t2.id]);
    expect(await ids({ limit: 2, offset: 2 })).toEqual([t1.id, t3.id]);
    expect(await repo.transactions.count({ accountIds: [a1.id] })).toBe(2);
    expect(await repo.transactions.count()).toBe(4);

    await repo.transactions.update(t1.id, {
      categorization: { method: "ml", confidence: 0.4, needsReview: true },
    });
    expect(await ids({ needsReview: true })).toEqual([t1.id]);
  });

  it("soft-deletes a transaction with its splits and tag links", async () => {
    const acc = await account();
    const tag = await repo.tags.create({ name: "t" });
    const tx = await repo.transactions.create(
      base(acc.id, { amount: -100, splits: [{ amount: -100 }], tagIds: [tag.id] }),
    );
    await repo.transactions.delete(tx.id);
    expect(await repo.transactions.get(tx.id)).toBeNull();
    expect(await repo.transactions.count()).toBe(0);
    const live = raw
      .prepare(
        "SELECT (SELECT count(*) FROM transaction_splits WHERE deleted_at IS NULL) + (SELECT count(*) FROM transaction_tags WHERE deleted_at IS NULL) AS n",
      )
      .get() as { n: number };
    expect(live.n).toBe(0);
    await expectCode(repo.transactions.delete(tx.id), "not_found");
  });

  it("moves a transaction between accounts of the same currency only", async () => {
    const eur = await account();
    const usd = await account({ name: "USD", currency: "USD" });
    const tx = await repo.transactions.create(base(eur.id));
    const eur2 = await account({ name: "EUR2" });
    expect((await repo.transactions.update(tx.id, { accountId: eur2.id })).accountId).toBe(eur2.id);
    await expectCode(repo.transactions.update(tx.id, { accountId: usd.id }), "validation");
  });
});

describe("transaction()", () => {
  it("commits everything together", async () => {
    const out = await repo.transaction(async (r) => {
      const a = await r.accounts.create({
        name: "A",
        type: "cash",
        currency: "EUR",
        openingBalance: 0,
      });
      await r.transactions.create({
        accountId: a.id,
        amount: -1,
        currency: "EUR",
        bookingDate: "2026-11-01",
      });
      return a.id;
    });
    expect(await repo.accounts.get(out)).not.toBeNull();
    expect(await repo.transactions.count()).toBe(1);
  });

  it("rolls everything back on error", async () => {
    await expect(
      repo.transaction(async (r) => {
        await r.accounts.create({ name: "A", type: "cash", currency: "EUR", openingBalance: 0 });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repo.accounts.list({ includeArchived: true })).toEqual([]);
  });

  it("is re-entrant: nested calls join the outer transaction", async () => {
    await expect(
      repo.transaction(async (r) => {
        await r.transaction(async (inner) => {
          await inner.accounts.create({
            name: "A",
            type: "cash",
            currency: "EUR",
            openingBalance: 0,
          });
        });
        throw new Error("outer fails");
      }),
    ).rejects.toThrow("outer fails");
    expect(await repo.accounts.list()).toEqual([]);
  });

  it("serializes concurrent callers on the single connection", async () => {
    // Without the queue, the second BEGIN would run inside the first transaction (the test executor throws).
    const results = await Promise.all([
      repo.transaction(async (r) => {
        await r.accounts.create({ name: "T1", type: "cash", currency: "EUR", openingBalance: 0 });
        await new Promise((res) => setTimeout(res, 5));
        await r.accounts.create({ name: "T1b", type: "cash", currency: "EUR", openingBalance: 0 });
        return "t1";
      }),
      repo.accounts.create({ name: "Plain", type: "cash", currency: "EUR", openingBalance: 0 }),
      repo.transaction(async (r) => {
        await r.accounts.create({ name: "T2", type: "cash", currency: "EUR", openingBalance: 0 });
        return "t2";
      }),
      ...Array.from({ length: 10 }, (_, i) =>
        repo.accounts.create({
          name: `Bulk${i}`,
          type: "cash",
          currency: "EUR",
          openingBalance: 0,
        }),
      ),
    ]);
    expect(results).toHaveLength(13);
    expect((await repo.accounts.list()).length).toBe(14);
  });

  it("failed transactions do not poison the queue", async () => {
    await expect(repo.transaction(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(account()).resolves.toBeDefined();
  });
});

describe("stamping", () => {
  it("gives every write a strictly newer hlc", async () => {
    const acc = await account();
    const seen = [acc.hlc];
    const tx = await repo.transactions.create({
      accountId: acc.id,
      amount: -1,
      currency: "EUR",
      bookingDate: "2026-11-01",
    });
    seen.push(tx.hlc);
    seen.push((await repo.transactions.update(tx.id, { notes: "a" })).hlc);
    seen.push((await repo.transactions.update(tx.id, { notes: "b" })).hlc);
    expect([...seen].sort()).toEqual(seen);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never assigns a server cursor locally", async () => {
    await account();
    const rows = raw.prepare("SELECT server_seq FROM accounts").all() as {
      server_seq: number | null;
    }[];
    expect(rows.every((r) => r.server_seq === null)).toBe(true);
  });
});

describe("derived account balances", () => {
  const tx = (accountId: string, amount: number, over: Record<string, unknown> = {}) =>
    repo.transactions.create({
      accountId,
      amount,
      currency: "EUR",
      bookingDate: "2026-11-01",
      ...over,
    });

  it("is the opening balance plus every non-deleted transaction, never stored", async () => {
    const a = await account({ openingBalance: 100_000 });
    const b = await account({ name: "Savings", openingBalance: 0 });
    await tx(a.id, -1234);
    await tx(a.id, 250_000);
    const pending = await tx(a.id, -500, { status: "pending" });
    await tx(b.id, 7);
    const list = await repo.accounts.listWithBalances();
    expect(list.map((x) => [x.name, x.balance, x.transactionCount])).toEqual([
      ["Checking", 100_000 - 1234 + 250_000 - 500, 3],
      ["Savings", 7, 1],
    ]);
    // deleting a transaction updates the balance; the account row itself is untouched
    const before = raw.prepare("SELECT updated_at, hlc FROM accounts WHERE id = ?").get(a.id);
    await repo.transactions.delete(pending.id);
    expect((await repo.accounts.getWithBalance(a.id))?.balance).toBe(100_000 - 1234 + 250_000);
    expect(raw.prepare("SELECT updated_at, hlc FROM accounts WHERE id = ?").get(a.id)).toEqual(
      before,
    );
    expect(
      raw
        .prepare("PRAGMA table_info(accounts)")
        .all()
        .map((c) => (c as { name: string }).name),
    ).not.toContain("balance");
  });

  it("handles an account with no transactions and a negative opening balance (credit card)", async () => {
    const card = await account({ type: "credit_card", openingBalance: -45_000 });
    expect(await repo.accounts.getWithBalance(card.id)).toMatchObject({
      balance: -45_000,
      transactionCount: 0,
    });
    expect(await repo.accounts.getWithBalance("019e0000-0000-7000-8000-000000000000")).toBeNull();
  });

  it("stays exact for large amounts (integer minor units, no floats)", async () => {
    const a = await account({ openingBalance: 9_000_000_000_000 });
    await tx(a.id, 1);
    await tx(a.id, 2);
    expect((await repo.accounts.getWithBalance(a.id))?.balance).toBe(9_000_000_000_003);
  });

  it("respects includeArchived", async () => {
    await account({ name: "Old", archived: true });
    expect((await repo.accounts.listWithBalances()).length).toBe(0);
    expect((await repo.accounts.listWithBalances({ includeArchived: true })).length).toBe(1);
  });

  it("locks the currency once the account has transactions", async () => {
    const empty = await account();
    expect((await repo.accounts.update(empty.id, { currency: "USD" })).currency).toBe("USD");
    const used = await account({ name: "Used" });
    await tx(used.id, -1);
    await expectCode(repo.accounts.update(used.id, { currency: "USD" }), "validation");
    expect((await repo.accounts.update(used.id, { currency: "EUR", name: "Used 2" })).name).toBe(
      "Used 2",
    );
  });
});

describe("account ordering", () => {
  it("reorders by position and bumps the clock for each moved account", async () => {
    const a = await account({ name: "A" });
    const b = await account({ name: "B" });
    const c = await account({ name: "C" });
    await repo.accounts.reorder([c.id, a.id, b.id]);
    const list = await repo.accounts.list();
    expect(list.map((x) => x.name)).toEqual(["C", "A", "B"]);
    expect(list.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
    expect(list.every((x) => x.hlc > a.hlc)).toBe(true);
  });

  it("rejects unknown ids and rolls back", async () => {
    const a = await account({ name: "A" });
    const b = await account({ name: "B" });
    await expectCode(
      repo.accounts.reorder([b.id, "019e0000-0000-7000-8000-000000000000", a.id]),
      "not_found",
    );
    expect((await repo.accounts.list()).map((x) => x.name)).toEqual(["A", "B"]);
  });
});

describe("category usage and ordering", () => {
  it("counts usage, refuses delete/type change while used, and archiving keeps history", async () => {
    const acc = await account();
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const spare = await repo.categories.create({ name: "Spare", type: "expense" });
    await repo.transactions.create({
      accountId: acc.id,
      amount: -500,
      currency: "EUR",
      bookingDate: "2026-11-01",
      categoryId: food.id,
    });
    expect(await repo.categories.usage()).toEqual({ [food.id]: 1 });
    await expectCode(repo.categories.delete(food.id), "validation");
    await expectCode(repo.categories.update(food.id, { type: "income" }), "validation");
    await repo.categories.update(food.id, { archived: true });
    expect((await repo.categories.get(food.id))?.archived).toBe(true);
    expect((await repo.transactions.list())[0]?.categoryId).toBe(food.id);
    await repo.categories.delete(spare.id); // unused: fine
    expect(await repo.categories.get(spare.id)).toBeNull();
  });

  it("refuses a type change while the category has subcategories", async () => {
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    await repo.categories.create({ name: "Cafe", type: "expense", parentId: food.id });
    await expectCode(repo.categories.update(food.id, { type: "income" }), "validation");
  });

  it("reorders siblings only", async () => {
    const a = await repo.categories.create({ name: "A", type: "expense" });
    const b = await repo.categories.create({ name: "B", type: "expense" });
    const c = await repo.categories.create({ name: "C", type: "expense", parentId: a.id });
    await repo.categories.reorder([b.id, a.id]);
    expect((await repo.categories.list()).filter((x) => !x.parentId).map((x) => x.name)).toEqual([
      "B",
      "A",
    ]);
    await expectCode(repo.categories.reorder([a.id, c.id]), "validation");
    await expectCode(
      repo.categories.reorder([a.id, "019e0000-0000-7000-8000-000000000000"]),
      "not_found",
    );
  });
});

describe("transfers", () => {
  const two = async () => {
    const a = await account({ name: "A", openingBalance: 100_000 });
    const b = await account({ name: "B", openingBalance: 0 });
    return { a, b };
  };
  const date = "2026-11-02";

  it("creates two linked legs that move money between accounts and net to zero", async () => {
    const { a, b } = await two();
    const [out, inn] = await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 25_000,
      bookingDate: date,
    });
    expect([out.amount, inn.amount]).toEqual([-25_000, 25_000]);
    expect(out.kind).toBe("transfer");
    expect(out.transferPeerId).toBe(inn.id);
    expect(inn.transferPeerId).toBe(out.id);
    expect(out.accountId).toBe(a.id);
    expect(inn.accountId).toBe(b.id);
    const balances = await repo.accounts.listWithBalances();
    expect(balances.map((x) => x.balance)).toEqual([75_000, 25_000]);
    expect(balances.reduce((s, x) => s + x.balance, 0)).toBe(100_000);
  });

  it("refuses bad transfers", async () => {
    const { a, b } = await two();
    const usd = await account({ name: "USD", currency: "USD" });
    const base = { bookingDate: date, amount: 100 };
    await expectCode(
      repo.transactions.createTransfer({ ...base, fromAccountId: a.id, toAccountId: a.id }),
      "validation",
    );
    await expectCode(
      repo.transactions.createTransfer({ ...base, fromAccountId: a.id, toAccountId: usd.id }),
      "validation",
    );
    await expectCode(
      repo.transactions.createTransfer({
        bookingDate: date,
        amount: 0,
        fromAccountId: a.id,
        toAccountId: b.id,
      }),
      "validation",
    );
  });

  it("edits both legs together, from either leg", async () => {
    const { a, b } = await two();
    const c = await account({ name: "C", openingBalance: 0 });
    const [out, inn] = await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 1000,
      bookingDate: date,
    });
    const [o2, i2] = await repo.transactions.updateTransfer(inn.id, {
      amount: 4000,
      toAccountId: c.id,
      notes: "rent share",
    });
    expect([o2.id, i2.id]).toEqual([out.id, inn.id]);
    expect([o2.amount, i2.amount]).toEqual([-4000, 4000]);
    expect(i2.accountId).toBe(c.id);
    expect([o2.notes, i2.notes]).toEqual(["rent share", "rent share"]);
    const balances = await repo.accounts.listWithBalances();
    expect(balances.map((x) => x.balance)).toEqual([96_000, 0, 4000]);
  });

  it("deleting either leg deletes both and restores balances", async () => {
    const { a, b } = await two();
    const [out, inn] = await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 1000,
      bookingDate: date,
    });
    await repo.transactions.delete(inn.id);
    expect(await repo.transactions.get(out.id)).toBeNull();
    expect(await repo.transactions.get(inn.id)).toBeNull();
    expect((await repo.accounts.listWithBalances()).map((x) => x.balance)).toEqual([100_000, 0]);
  });

  it("keeps transfers out of the generic create/update paths", async () => {
    const { a, b } = await two();
    await expectCode(
      repo.transactions.create({
        accountId: a.id,
        amount: -5,
        currency: "EUR",
        bookingDate: date,
        kind: "transfer",
      }),
      "validation",
    );
    const [out] = await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 5,
      bookingDate: date,
    });
    await expectCode(repo.transactions.update(out.id, { amount: -9 }), "validation");
    await expectCode(
      repo.transactions.updateTransfer("019e0000-0000-7000-8000-000000000000", {}),
      "not_found",
    );
  });
});

describe("split rules", () => {
  it("rejects splits that do not sum to the amount, on create and update", async () => {
    const a = await account();
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const home = await repo.categories.create({ name: "Home", type: "expense" });
    const base = { accountId: a.id, currency: "EUR", bookingDate: "2026-11-02", amount: -1000 };
    await expectCode(
      repo.transactions.create({
        ...base,
        splits: [
          { amount: -600, categoryId: food.id },
          { amount: -399, categoryId: home.id },
        ],
      }),
      "validation",
    );
    const ok = await repo.transactions.create({
      ...base,
      splits: [
        { amount: -600, categoryId: food.id },
        { amount: -400, categoryId: home.id },
      ],
    });
    expect(ok.splits.map((s) => s.amount)).toEqual([-600, -400]);
    // changing the amount without re-splitting must fail; with matching splits it passes
    await expectCode(repo.transactions.update(ok.id, { amount: -1200 }), "validation");
    const moved = await repo.transactions.update(ok.id, {
      amount: -1200,
      splits: [
        { amount: -700, categoryId: food.id },
        { amount: -500, categoryId: home.id },
      ],
    });
    expect(moved.splits.reduce((s, x) => s + x.amount, 0)).toBe(-1200);
  });
});

describe("transaction sorting", () => {
  it("orders by date, amount and payee, both ways, with stable ties", async () => {
    const a = await account();
    const mk = (amount: number, bookingDate: string, payee: string) =>
      repo.transactions.create({ accountId: a.id, amount, currency: "EUR", bookingDate, payee });
    await mk(-500, "2026-11-01", "bravo");
    await mk(-100, "2026-11-03", "Alpha");
    await mk(900, "2026-11-02", "charlie");
    const names = async (sort: { by: "date" | "amount" | "payee"; dir: "asc" | "desc" }) =>
      (await repo.transactions.list({ sort })).map((x) => x.payee);
    expect(await names({ by: "date", dir: "desc" })).toEqual(["Alpha", "charlie", "bravo"]);
    expect(await names({ by: "date", dir: "asc" })).toEqual(["bravo", "charlie", "Alpha"]);
    expect(await names({ by: "amount", dir: "asc" })).toEqual(["bravo", "Alpha", "charlie"]);
    expect(await names({ by: "amount", dir: "desc" })).toEqual(["charlie", "Alpha", "bravo"]);
    expect(await names({ by: "payee", dir: "asc" })).toEqual(["Alpha", "bravo", "charlie"]); // case-insensitive
    // paging stays consistent under a sort
    const p1 = await repo.transactions.list({ sort: { by: "amount", dir: "asc" }, limit: 2 });
    const p2 = await repo.transactions.list({
      sort: { by: "amount", dir: "asc" },
      limit: 2,
      offset: 2,
    });
    expect([...p1, ...p2].map((x) => x.payee)).toEqual(["bravo", "Alpha", "charlie"]);
  });
});

describe("scale", () => {
  it("serves filtered, sorted pages from 50k rows quickly", async () => {
    const a = await account();
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const seed = await repo.transactions.create({
      accountId: a.id,
      amount: -1,
      currency: "EUR",
      bookingDate: "2026-01-01",
      payee: "seed",
      categoryId: food.id,
    });
    const cols = (raw.prepare("PRAGMA table_info(transactions)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    const expr = (c: string) =>
      c === "id"
        ? "lower(hex(randomblob(16)))"
        : c === "amount"
          ? "-(i % 5000) - 1"
          : c === "booking_date"
            ? "date('2026-01-01', '+' || (i % 900) || ' days')"
            : c === "payee"
              ? "'payee ' || (i % 700)"
              : c === "created_at"
                ? "strftime('%Y-%m-%dT%H:%M:%fZ', '2026-01-01', '+' || i || ' seconds')"
                : `(SELECT ${c} FROM transactions WHERE id = '${seed.id}')`;
    raw.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 50000)
       INSERT INTO transactions (${cols.join(",")}) SELECT ${cols.map(expr).join(",")} FROM n`,
    );
    expect(await repo.transactions.count()).toBe(50_001);

    const timed = async (label: string, fn: () => Promise<unknown>) => {
      const t0 = performance.now();
      await fn();
      const ms = performance.now() - t0;
      console.info(`50k rows - ${label}: ${ms.toFixed(0)} ms`);
      return ms;
    };
    const budget = 750; // generous: the page must stay interactive on a slow CI box
    const page = { limit: 100 };
    expect(await timed("newest page", () => repo.transactions.list(page))).toBeLessThan(budget);
    expect(
      await timed("by amount", () =>
        repo.transactions.list({ ...page, sort: { by: "amount", dir: "asc" } }),
      ),
    ).toBeLessThan(budget);
    expect(
      await timed("by payee", () =>
        repo.transactions.list({ ...page, sort: { by: "payee", dir: "asc" } }),
      ),
    ).toBeLessThan(budget);
    expect(
      await timed("deep page (10k rows in)", () =>
        repo.transactions.list({ ...page, offset: 10_000 }),
      ),
    ).toBeLessThan(budget);
    expect(
      await timed("period + account", () =>
        repo.transactions.list({
          ...page,
          accountIds: [a.id],
          from: "2026-03-01",
          to: "2026-03-31",
        }),
      ),
    ).toBeLessThan(budget);
    expect(
      await timed("text search", () => repo.transactions.list({ ...page, search: "payee 69" })),
    ).toBeLessThan(budget);
    expect(
      await timed("count", () => repo.transactions.count({ search: "payee 69" })),
    ).toBeLessThan(budget);
    const month = { from: "2026-03-01", to: "2026-03-31" };
    expect(await timed("month cashflow", () => repo.transactions.cashflow(month))).toBeLessThan(
      budget,
    );
    expect(
      await timed("month spending by category", () => repo.transactions.spendingByCategory(month)),
    ).toBeLessThan(budget);
    expect(
      await timed("net worth (balances)", () => repo.accounts.listWithBalances()),
    ).toBeLessThan(budget);
  }, 60_000);
});

describe("dashboard aggregates", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };

  it("sums income and expense per currency, skipping transfers, excluded rows and other months", async () => {
    const a = await account();
    const b = await account({ name: "Savings", openingBalance: 0 });
    const usd = await account({ name: "USD", currency: "USD" });
    const tx = (accountId: string, amount: number, over: Record<string, unknown> = {}) =>
      repo.transactions.create({
        accountId,
        amount,
        currency: accountId === usd.id ? "USD" : "EUR",
        bookingDate: "2026-11-10",
        ...over,
      });
    await tx(a.id, -1000);
    await tx(a.id, -250, { status: "pending" });
    await tx(a.id, 5000);
    await tx(a.id, -9999, { excludedFromReports: true });
    await tx(a.id, -777, { bookingDate: "2026-10-31" });
    await tx(usd.id, -300);
    await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 4000,
      bookingDate: "2026-11-11",
    });
    expect(await repo.transactions.cashflow(range)).toEqual([
      { currency: "EUR", income: 5000, expense: -1250 },
      { currency: "USD", income: 0, expense: -300 },
    ]);
    expect(await repo.transactions.cashflow({ from: "2027-01-01", to: "2027-01-31" })).toEqual([]);
  });

  it("totals spending per category, counting splits under their own categories", async () => {
    const a = await account();
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const home = await repo.categories.create({ name: "Home", type: "expense" });
    const base = { accountId: a.id, currency: "EUR", bookingDate: "2026-11-10" };
    await repo.transactions.create({ ...base, amount: -1000, categoryId: food.id });
    await repo.transactions.create({ ...base, amount: -500 }); // uncategorised
    await repo.transactions.create({
      ...base,
      amount: -900,
      splits: [
        { amount: -600, categoryId: food.id },
        { amount: -300, categoryId: home.id },
      ],
    });
    await repo.transactions.create({ ...base, amount: 7000 }); // income: not spending
    const rows = await repo.transactions.spendingByCategory(range);
    expect(rows).toEqual([
      { categoryId: food.id, currency: "EUR", total: -1600 },
      { categoryId: null, currency: "EUR", total: -500 },
      { categoryId: home.id, currency: "EUR", total: -300 },
    ]);
    // the parts add up to total expenses
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(-2400);
    expect((await repo.transactions.cashflow(range))[0]?.expense).toBe(-2400);
  });
});

describe("budgets", () => {
  const input = {
    name: "Groceries",
    period: "month" as const,
    start: "2026-11-01",
    amount: 30_000,
    currency: "EUR",
  };

  it("creates with defaults, lists, updates and soft deletes", async () => {
    const b = await repo.budgets.create(input);
    expect(b).toMatchObject({
      end: null,
      rollover: false,
      scope: { categoryIds: [], tagIds: [], accountIds: [] },
    });
    expect(idSchema.safeParse(b.id).success).toBe(true);
    const upd = await repo.budgets.update(b.id, { amount: 40_000, rollover: true });
    expect(upd).toMatchObject({ amount: 40_000, rollover: true });
    expect((await repo.budgets.get(b.id))?.amount).toBe(40_000);
    expect(await repo.budgets.list()).toHaveLength(1);
    await repo.budgets.delete(b.id);
    expect(await repo.budgets.list()).toEqual([]);
    expect(await repo.budgets.get(b.id)).toBeNull();
    await expectCode(repo.budgets.delete(b.id), "not_found");
    await expectCode(repo.budgets.update(b.id, { amount: 1 }), "not_found");
  });

  it("round-trips the scope and queues the change for sync", async () => {
    const acc = await account();
    const cat = await repo.categories.create({ name: "Food", type: "expense" });
    const tag = await repo.tags.create({ name: "trip" });
    const scope = { categoryIds: [cat.id], tagIds: [tag.id], accountIds: [acc.id] };
    const b = await repo.budgets.create({ ...input, scope });
    expect((await repo.budgets.get(b.id))?.scope).toEqual(scope);
    const queued = raw.prepare("select row_id from outbox where table_name = 'budgets'").all();
    expect(queued).toEqual([{ row_id: b.id }]);
  });

  it("validates input and scope references", async () => {
    await expectCode(repo.budgets.create({ ...input, amount: -1 }), "validation");
    await expectCode(repo.budgets.create({ ...input, name: " " }), "validation");
    await expectCode(repo.budgets.create({ ...input, period: "custom" }), "validation");
    await expectCode(repo.budgets.create({ ...input, end: "2026-10-01" }), "validation");
    const missing = idSchema.parse("01900000-0000-7000-8000-000000000000");
    await expectCode(
      repo.budgets.create({
        ...input,
        scope: { categoryIds: [missing], tagIds: [], accountIds: [] },
      }),
      "validation",
    );
    await expectCode(
      repo.budgets.create({
        ...input,
        scope: { categoryIds: [], tagIds: [missing], accountIds: [] },
      }),
      "validation",
    );
    await expectCode(
      repo.budgets.create({
        ...input,
        scope: { categoryIds: [], tagIds: [], accountIds: [missing] },
      }),
      "validation",
    );
  });
});

describe("spendEntries", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };

  it("returns expenses as flat entries: splits expanded, transfers/income/excluded/other months left out", async () => {
    const a = await account();
    const b = await account({ name: "Savings", openingBalance: 0 });
    const food = await repo.categories.create({ name: "Food", type: "expense" });
    const home = await repo.categories.create({ name: "Home", type: "expense" });
    const tag = await repo.tags.create({ name: "trip" });
    const base = { accountId: a.id, currency: "EUR", bookingDate: "2026-11-10" };
    const plain = await repo.transactions.create({
      ...base,
      amount: -1000,
      categoryId: food.id,
      tagIds: [tag.id],
    });
    await repo.transactions.create({
      ...base,
      amount: -900,
      splits: [
        { amount: -600, categoryId: food.id },
        { amount: -300, categoryId: home.id },
      ],
      tagIds: [tag.id],
    });
    await repo.transactions.create({ ...base, amount: 5000 });
    await repo.transactions.create({ ...base, amount: -777, excludedFromReports: true });
    await repo.transactions.create({ ...base, amount: -555, bookingDate: "2026-10-31" });
    await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 400,
      bookingDate: "2026-11-10",
    });
    const deleted = await repo.transactions.create({ ...base, amount: -123 });
    await repo.transactions.delete(deleted.id);

    const entries = await repo.transactions.spendEntries(range);
    expect(entries).toHaveLength(3);
    const key = (e: { amount: number }) => e.amount;
    expect(entries.map(key).sort((x, y) => x - y)).toEqual([-1000, -600, -300]);
    const one = entries.find((e) => e.amount === -1000);
    expect(one).toEqual({
      date: "2026-11-10",
      amount: -1000,
      currency: "EUR",
      categoryId: food.id,
      accountId: a.id,
      tagIds: [tag.id],
    });
    expect(plain.id).toBeTruthy();
    // split entries inherit the transaction's tags and account
    for (const e of entries.filter((x) => x.amount !== -1000)) {
      expect(e.tagIds).toEqual([tag.id]);
      expect(e.accountId).toBe(a.id);
    }
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(-1900);
  });
});

describe("recurring rules", () => {
  const tpl = (accountId: string, over: Record<string, unknown> = {}) => ({
    payee: "Netflix",
    amount: -1299,
    currency: "EUR",
    accountId,
    categoryId: null,
    ...over,
  });
  const rule = (accountId: string, over: Record<string, unknown> = {}) => ({
    template: tpl(accountId),
    rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
    nextDate: "2026-12-05",
    ...over,
  });

  it("creates, lists by next date, pauses, updates and soft deletes", async () => {
    const a = await account();
    const late = await repo.recurring.create(rule(a.id, { nextDate: "2027-01-01" }));
    const soon = await repo.recurring.create(
      rule(a.id, { nextDate: "2026-11-20", autoDetected: true }),
    );
    expect(soon).toMatchObject({ active: true, autoDetected: true });
    expect(late.autoDetected).toBe(false);
    expect((await repo.recurring.list()).map((r) => r.id)).toEqual([soon.id, late.id]);

    await repo.recurring.update(late.id, { active: false });
    expect((await repo.recurring.list()).map((r) => r.id)).toEqual([soon.id]);
    expect(await repo.recurring.list({ includeInactive: true })).toHaveLength(2);

    const moved = await repo.recurring.update(soon.id, { nextDate: "2026-12-20" });
    expect(moved.nextDate).toBe("2026-12-20");
    expect((await repo.recurring.get(soon.id))?.template).toEqual(tpl(a.id));
    expect(
      raw.prepare("select count(*) as n from outbox where table_name = 'recurring_rules'").get(),
    ).toEqual({ n: 2 });

    await repo.recurring.delete(soon.id);
    expect(await repo.recurring.get(soon.id)).toBeNull();
    await expectCode(repo.recurring.delete(soon.id), "not_found");
    await expectCode(repo.recurring.update(soon.id, { active: false }), "not_found");
  });

  it("rejects unsupported rules and bad templates", async () => {
    const a = await account();
    const usd = await account({ name: "USD", currency: "USD" });
    const missing = idSchema.parse("01900000-0000-7000-8000-000000000000");
    await expectCode(
      repo.recurring.create(rule(a.id, { rrule: "FREQ=MONTHLY;COUNT=3" })),
      "validation",
    );
    await expectCode(repo.recurring.create(rule(a.id, { rrule: "" })), "validation");
    await expectCode(repo.recurring.create(rule(a.id, { nextDate: "nope" })), "validation");
    await expectCode(repo.recurring.create(rule(missing)), "validation");
    await expectCode(repo.recurring.create(rule(usd.id)), "validation"); // EUR template on a USD account
    await expectCode(
      repo.recurring.create(rule(a.id, { template: tpl(a.id, { amount: 0 }) })),
      "validation",
    );
    await expectCode(
      repo.recurring.create(rule(a.id, { template: tpl(a.id, { categoryId: missing }) })),
      "validation",
    );
  });
});

describe("goals", () => {
  it("creates, updates and soft deletes; the linked accounts round-trip", async () => {
    const a = await account();
    const g = await repo.goals.create({
      name: "Holiday",
      targetAmount: 200_000,
      currency: "EUR",
      deadline: "2027-06-01",
      accountIds: [a.id],
      color: "#336699",
    });
    expect((await repo.goals.get(g.id))?.accountIds).toEqual([a.id]);
    const upd = await repo.goals.update(g.id, { targetAmount: 250_000, deadline: null });
    expect(upd).toMatchObject({ targetAmount: 250_000, deadline: null });
    expect(await repo.goals.list()).toHaveLength(1);
    expect(
      raw.prepare("select count(*) as n from outbox where table_name = 'goals'").get(),
    ).toEqual({ n: 1 });
    await repo.goals.delete(g.id);
    expect(await repo.goals.list()).toEqual([]);
    await expectCode(repo.goals.delete(g.id), "not_found");
    await expectCode(repo.goals.update(g.id, { name: "x" }), "not_found");
  });

  it("validates input and linked accounts", async () => {
    const missing = idSchema.parse("01900000-0000-7000-8000-000000000000");
    const base = { name: "Car", targetAmount: 1000, currency: "EUR" };
    await expectCode(repo.goals.create({ ...base, targetAmount: 0 }), "validation");
    await expectCode(repo.goals.create({ ...base, name: " " }), "validation");
    await expectCode(repo.goals.create({ ...base, accountIds: [missing] }), "validation");
    expect(await repo.goals.create(base)).toMatchObject({ accountIds: [], deadline: null });
  });
});

describe("debts", () => {
  const tx = (
    accountId: string,
    amount: number,
    debtId: string | null,
    over: Record<string, unknown> = {},
  ) =>
    repo.transactions.create({
      accountId,
      amount,
      currency: "EUR",
      bookingDate: "2026-11-10",
      debtId,
      ...over,
    });

  it("derives repaid amounts from linked transactions, by direction", async () => {
    const a = await account();
    const lent = await repo.debts.create({
      person: "Ana",
      direction: "lent",
      amount: 10_000,
      currency: "EUR",
    });
    const borrowed = await repo.debts.create({
      person: "Rui",
      direction: "borrowed",
      amount: 5000,
      currency: "EUR",
    });
    await tx(a.id, 3000, lent.id); // Ana pays back 30
    await tx(a.id, 2000, lent.id);
    await tx(a.id, -10_000, lent.id); // the loan itself leaving the account: not a repayment
    await tx(a.id, -1500, borrowed.id);
    await tx(a.id, 800, borrowed.id); // money in on a borrowed debt: not a repayment
    const [l, b] = [await repo.debts.get(lent.id), await repo.debts.get(borrowed.id)];
    expect(l).toMatchObject({ repaid: 5000, repaymentCount: 2 });
    expect(b).toMatchObject({ repaid: 1500, repaymentCount: 1 });
    expect((await repo.debts.list()).map((d) => d.person).sort()).toEqual(["Ana", "Rui"]);
    // deleting a repayment lowers the total: nothing is stored
    const [first] = await repo.transactions.list({
      debtId: lent.id,
      minAmount: 1,
      sort: { by: "amount", dir: "desc" },
    });
    await repo.transactions.delete(first?.id ?? "");
    expect((await repo.debts.get(lent.id))?.repaid).toBe(2000);
  });

  it("hides settled debts by default and edits", async () => {
    const d = await repo.debts.create({
      person: "Ana",
      direction: "lent",
      amount: 100,
      currency: "EUR",
    });
    await repo.debts.update(d.id, { settled: true });
    expect(await repo.debts.list()).toEqual([]);
    expect(await repo.debts.list({ includeSettled: true })).toHaveLength(1);
    await expectCode(
      repo.debts.create({ person: "", direction: "lent", amount: 1, currency: "EUR" }),
      "validation",
    );
    await expectCode(
      repo.debts.create({ person: "x", direction: "lent", amount: 0, currency: "EUR" }),
      "validation",
    );
  });

  it("only links transactions to existing debts in the same currency", async () => {
    const a = await account();
    const d = await repo.debts.create({
      person: "Ana",
      direction: "lent",
      amount: 100,
      currency: "USD",
    });
    const missing = idSchema.parse("01900000-0000-7000-8000-000000000000");
    await expectCode(tx(a.id, 100, missing), "validation");
    await expectCode(tx(a.id, 100, d.id), "validation"); // EUR vs USD
    const ok = await tx(a.id, 100, null);
    await expectCode(repo.transactions.update(ok.id, { debtId: d.id }), "validation");
    await expectCode(
      repo.debts.get(d.id).then(() => repo.debts.update(missing, { settled: true })),
      "not_found",
    );
  });

  it("deleting a debt unlinks its repayments but keeps them", async () => {
    const a = await account();
    const d = await repo.debts.create({
      person: "Ana",
      direction: "lent",
      amount: 10_000,
      currency: "EUR",
    });
    const t1 = await tx(a.id, 3000, d.id);
    await repo.debts.delete(d.id);
    expect(await repo.debts.get(d.id)).toBeNull();
    expect((await repo.transactions.get(t1.id))?.debtId).toBeNull();
    await expectCode(repo.debts.delete(d.id), "not_found");
  });

  it("refuses to change the currency once repayments exist", async () => {
    const a = await account();
    const d = await repo.debts.create({
      person: "Ana",
      direction: "lent",
      amount: 10_000,
      currency: "EUR",
    });
    expect((await repo.debts.update(d.id, { currency: "USD" })).currency).toBe("USD");
    await repo.debts.update(d.id, { currency: "EUR" });
    await tx(a.id, 3000, d.id);
    await expectCode(repo.debts.update(d.id, { currency: "USD" }), "validation");
  });
});
