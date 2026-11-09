import { describe, expect, it } from "vitest";
import { categorize } from "./decide";
import { buildPayeeMemory, lookupPayeeMemory } from "./memory";
import { type MlExample, type Model, splitHeldOut, trainModel } from "./ml";
import type { RuleLike } from "./rules";
import { suggestCategories } from "./suggest";

const kinds: Record<string, "expense" | "income"> = {
  groceries: "expense",
  fuel: "expense",
  salary: "income",
};
const ctx = { rules: [] as RuleLike[], categoryKind: (id: string) => kinds[id] };
const facts = (payee: string, amount = -1000) => ({
  payee,
  description: payee,
  amount,
  accountId: "a",
});

const user = (payee: string, categoryId: string) => ({
  payee,
  kind: "expense" as const,
  categoryId,
  method: "user" as const,
});

describe("payee memory", () => {
  it("remembers a payee the user put in one category at least twice, mostly", () => {
    const memory = buildPayeeMemory([
      user("Lidl", "groceries"),
      user("LIDL ", "groceries"),
      user("Galp", "fuel"),
      { ...user("Padaria", "groceries"), method: "ml" as const },
      { ...user("Padaria", "groceries"), method: "ml" as const },
      user("Mixed", "groceries"),
      user("Mixed", "groceries"),
      user("Mixed", "groceries"),
      user("Mixed", "groceries"),
      user("Mixed", "fuel"),
      user("Split", "groceries"),
      user("Split", "groceries"),
      user("Split", "fuel"),
      user("Split", "fuel"),
    ]);
    expect(lookupPayeeMemory(memory, "lidl")).toEqual({
      categoryId: "groceries",
      count: 2,
      total: 2,
    });
    expect(lookupPayeeMemory(memory, "Galp")).toBeNull(); // once is not a habit
    expect(lookupPayeeMemory(memory, "Padaria")).toBeNull(); // guesses are not memories
    expect(lookupPayeeMemory(memory, "Mixed")?.categoryId).toBe("groceries"); // 4/5 = 0.8
    expect(lookupPayeeMemory(memory, "Split")).toBeNull(); // 2/4 is no habit
  });

  it("is used by categorize with confidence 0.95 and never against the sign", () => {
    const memory = buildPayeeMemory([user("Lidl", "groceries"), user("Lidl", "groceries")]);
    expect(categorize(facts("Lidl"), { ...ctx, memory })).toMatchObject({
      categoryId: "groceries",
      method: "payee_memory",
      confidence: 0.95,
      needsReview: false,
    });
    expect(categorize(facts("Lidl", 1000), { ...ctx, memory })).toMatchObject({ method: "none" });
  });

  it("loses to a rule", () => {
    const memory = buildPayeeMemory([user("Lidl", "groceries"), user("Lidl", "groceries")]);
    const rules: RuleLike[] = [
      {
        id: "r",
        priority: 0,
        conditions: [{ field: "payee", op: "contains", value: "lidl" }],
        action: { categoryId: "fuel" },
      },
    ];
    expect(categorize(facts("Lidl"), { ...ctx, rules, memory }).method).toBe("rule");
  });
});

describe("model thresholds", () => {
  // Two cleanly separable merchants plus a handful of noisy ones, so probabilities land on both sides of 0.85.
  const rows: MlExample[] = [];
  for (let i = 0; i < 400; i++) {
    const lidl = i % 2 === 0;
    rows.push({
      id: `0190a5c4-7b1e-7a3f-8c2d-${String(i).padStart(12, "0")}`,
      payee: lidl ? "Lidl" : "Galp",
      description: lidl ? `LIDL LISBOA ${i}` : `GALP ENERGIA ${i}`,
      amount: lidl ? -2000 : -5000,
      accountId: "a",
      categoryId: lidl ? "groceries" : "fuel",
    });
  }
  const { train, heldOut } = splitHeldOut(rows);
  const model = trainModel(train, heldOut) as Model;

  it("assigns a confident prediction without review", () => {
    const d = categorize(
      { ...facts("Lidl", -2000), description: "LIDL LISBOA 77" },
      { ...ctx, model },
    );
    expect(d).toMatchObject({ categoryId: "groceries", method: "ml", needsReview: false });
    expect(d.confidence).toBeGreaterThan(0.85);
  });

  it("leaves text it does not know uncategorised and flags it", () => {
    const d = categorize(
      { ...facts("Zxqv", -123), description: "QWJKL ZZZ", accountId: "elsewhere" },
      { ...ctx, model },
    );
    expect(d.method === "none" || d.needsReview).toBe(true);
  });

  it("ignores predictions whose category type contradicts the sign", () => {
    const d = categorize(
      { ...facts("Lidl", 2000), description: "LIDL LISBOA 77" },
      { ...ctx, model },
    );
    expect(d.categoryId === null || kinds[d.categoryId] === "income").toBe(true);
  });

  it("flags every uncategorised result for review, with or without a model", () => {
    expect(categorize(facts("Whatever"), ctx)).toMatchObject({
      categoryId: null,
      method: "none",
      confidence: 0,
      needsReview: true,
    });
  });
});

describe("suggestCategories", () => {
  const memory = buildPayeeMemory([user("Lidl", "groceries"), user("Lidl", "groceries")]);

  it("lists rule, then memory, then model picks, without repeats or wrong-sign categories", () => {
    const rules: RuleLike[] = [
      {
        id: "r",
        priority: 0,
        conditions: [{ field: "payee", op: "contains", value: "lidl" }],
        action: { categoryId: "fuel" },
      },
    ];
    const out = suggestCategories(facts("Lidl"), { ...ctx, rules, memory });
    expect(out.map((s) => [s.categoryId, s.source])).toEqual([
      ["fuel", "rule"],
      ["groceries", "payee_memory"],
    ]);
    // income categories never fit an outflow
    expect(
      suggestCategories(facts("Lidl"), { ...ctx, memory, rules: [] }).every(
        (s) => kinds[s.categoryId] === "expense",
      ),
    ).toBe(true);
    expect(suggestCategories(facts("Lidl", 500), { ...ctx, memory })).toEqual([]);
  });

  it("is empty when nothing is known", () => {
    expect(suggestCategories(facts("Zzz"), ctx)).toEqual([]);
  });
});
