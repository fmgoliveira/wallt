import { describe, expect, it } from "vitest";
import { createTestRepository } from "./test-utils";

async function setup() {
  const { repo, raw } = await createTestRepository();
  const [groceries, fuel] = await Promise.all([
    repo.categories.create({ name: "Groceries", type: "expense" }),
    repo.categories.create({ name: "Fuel", type: "expense" }),
  ]);
  const tag = await repo.tags.create({ name: "weekly" });
  return { repo, raw, groceries: groceries.id, fuel: fuel.id, tag: tag.id };
}

const cond = [{ field: "payee", op: "contains", value: "lidl" }] as const;

describe("rules repository", () => {
  it("creates in order, lists by priority and round-trips conditions and action", async () => {
    const { repo, groceries, tag } = await setup();
    const a = await repo.rules.create({
      name: "Lidl",
      conditions: [...cond],
      action: { categoryId: groceries, tagIds: [tag], payeeRename: "Lidl" },
    });
    const b = await repo.rules.create({
      name: "Second",
      conditions: [{ field: "amount", op: "gte", value: 1000 }],
      action: { categoryId: groceries },
    });
    expect([a.priority, b.priority]).toEqual([0, 1]);
    const list = await repo.rules.list();
    expect(list.map((r) => r.name)).toEqual(["Lidl", "Second"]);
    expect(list[0]).toMatchObject({
      conditions: [...cond],
      action: { categoryId: groceries, tagIds: [tag], payeeRename: "Lidl" },
    });
    expect(await repo.rules.get(a.id)).toMatchObject({ name: "Lidl" });
  });

  it("rejects unknown categories and tags, empty conditions and blank names", async () => {
    const { repo, groceries } = await setup();
    const ghost = "0190a5c4-7b1e-7a3f-8c2d-0000000000aa";
    await expect(
      repo.rules.create({ name: "x", conditions: [...cond], action: { categoryId: ghost } }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repo.rules.create({ name: "x", conditions: [...cond], action: { tagIds: [ghost] } }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repo.rules.create({ name: "x", conditions: [], action: { categoryId: groceries } }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      repo.rules.create({ name: " ", conditions: [...cond], action: { categoryId: groceries } }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("updates, reorders and soft-deletes", async () => {
    const { repo, groceries, fuel } = await setup();
    const a = await repo.rules.create({
      name: "A",
      conditions: [...cond],
      action: { categoryId: groceries },
    });
    const b = await repo.rules.create({
      name: "B",
      conditions: [...cond],
      action: { categoryId: groceries },
    });
    const updated = await repo.rules.update(a.id, { action: { categoryId: fuel } });
    expect(updated.action.categoryId).toBe(fuel);
    expect(updated.hlc > a.hlc).toBe(true);

    await repo.rules.reorder([b.id, a.id]);
    expect((await repo.rules.list()).map((r) => r.name)).toEqual(["B", "A"]);

    await repo.rules.delete(a.id);
    expect((await repo.rules.list()).map((r) => r.name)).toEqual(["B"]);
    expect(await repo.rules.get(a.id)).toBeNull();
    await expect(repo.rules.update(a.id, { name: "x" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(repo.rules.delete(a.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes through the outbox so rules sync", async () => {
    const { repo, raw, groceries } = await setup();
    const r = await repo.rules.create({
      name: "A",
      conditions: [...cond],
      action: { categoryId: groceries },
    });
    const rows = raw
      .prepare("SELECT op FROM outbox WHERE table_name = 'rules' AND row_id = ?")
      .all(r.id);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("payee aliases repository", () => {
  it("creates, lists oldest first, updates and deletes", async () => {
    const { repo } = await setup();
    const a = await repo.payeeAliases.create({ pattern: "PINGO DOCE.*", payee: "Pingo Doce" });
    const b = await repo.payeeAliases.create({ pattern: "lidl", payee: "Lidl" });
    expect((await repo.payeeAliases.list()).map((x) => x.payee)).toEqual(["Pingo Doce", "Lidl"]);
    const u = await repo.payeeAliases.update(b.id, { payee: "Lidl Portugal" });
    expect(u.payee).toBe("Lidl Portugal");
    await repo.payeeAliases.delete(a.id);
    expect((await repo.payeeAliases.list()).map((x) => x.payee)).toEqual(["Lidl Portugal"]);
    await expect(repo.payeeAliases.delete(a.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects blank patterns and payees", async () => {
    const { repo } = await setup();
    await expect(repo.payeeAliases.create({ pattern: " ", payee: "x" })).rejects.toMatchObject({
      code: "validation",
    });
    await expect(repo.payeeAliases.create({ pattern: "x", payee: " " })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("transactions created with a categorization", () => {
  it("keeps the method and confidence given by a rule or model", async () => {
    const { repo, groceries } = await setup();
    const acc = await repo.accounts.create({
      name: "A",
      type: "cash",
      currency: "EUR",
      openingBalance: 0,
    });
    const t = await repo.transactions.create({
      accountId: acc.id,
      amount: -500,
      currency: "EUR",
      bookingDate: "2026-01-02",
      categoryId: groceries,
      categorization: { method: "rule", confidence: 1, needsReview: false },
    });
    expect(t.categorization).toEqual({ method: "rule", confidence: 1, needsReview: false });
    const plain = await repo.transactions.create({
      accountId: acc.id,
      amount: -500,
      currency: "EUR",
      bookingDate: "2026-01-02",
      categoryId: groceries,
    });
    expect(plain.categorization.method).toBe("user");
  });
});

describe("categorizationStats", () => {
  it("counts non-transfer transactions per method and the review queue", async () => {
    const { repo, groceries } = await setup();
    const a = await repo.accounts.create({
      name: "A",
      type: "cash",
      currency: "EUR",
      openingBalance: 0,
    });
    const b = await repo.accounts.create({
      name: "B",
      type: "cash",
      currency: "EUR",
      openingBalance: 0,
    });
    const base = { accountId: a.id, currency: "EUR", bookingDate: "2026-02-01" };
    await repo.transactions.create({ ...base, amount: -100, categoryId: groceries }); // user
    await repo.transactions.create({
      ...base,
      amount: -200,
      categoryId: groceries,
      categorization: { method: "rule", confidence: 1, needsReview: false },
    });
    await repo.transactions.create({
      ...base,
      amount: -300,
      categoryId: groceries,
      categorization: { method: "ml", confidence: 0.6, needsReview: true },
    });
    await repo.transactions.create({ ...base, amount: -400, needsReview: true }); // none
    const late = await repo.transactions.create({
      ...base,
      bookingDate: "2026-06-01",
      amount: -500,
    });
    await repo.transactions.createTransfer({
      fromAccountId: a.id,
      toAccountId: b.id,
      amount: 1000,
      bookingDate: "2026-02-01",
    });

    expect(await repo.transactions.categorizationStats()).toEqual({
      total: 5,
      methods: { user: 1, rule: 1, payee_memory: 0, ml: 1, none: 2 },
      needsReview: 2,
    });
    expect((await repo.transactions.categorizationStats({ from: "2026-05-01" })).total).toBe(1);
    await repo.transactions.delete(late.id);
    expect((await repo.transactions.categorizationStats()).total).toBe(4);
  });
});
