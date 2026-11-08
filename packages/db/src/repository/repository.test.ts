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
