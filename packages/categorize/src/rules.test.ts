import type { RuleCondition } from "@wallt/core";
import { describe, expect, it } from "vitest";
import { categorize } from "./decide";
import { DEFAULT_RULE_SPECS, defaultRuleConditions } from "./defaults";
import {
  conditionMatches,
  conditionsFromTransaction,
  evaluateRules,
  type HistoryTx,
  planRecategorization,
  previewRule,
  type RuleLike,
  ruleMatches,
  sortRules,
  type TxFacts,
  validateCondition,
} from "./rules";

const tx = (over: Partial<TxFacts> = {}): TxFacts => ({
  payee: "Continente Bom Dia",
  description: "COMPRA CONTINENTE LISBOA",
  amount: -2350,
  accountId: "acc-1",
  ...over,
});

const rule = (
  id: string,
  priority: number,
  conditions: RuleCondition[],
  action = {},
): RuleLike => ({
  id,
  priority,
  conditions,
  action,
});

describe("conditions", () => {
  it("matches text ignoring case, accents and punctuation", () => {
    const f = tx({ payee: "Farmácia São João" });
    expect(conditionMatches({ field: "payee", op: "contains", value: "FARMACIA sao" }, f)).toBe(
      true,
    );
    expect(conditionMatches({ field: "payee", op: "equals", value: "farmacia sao joao" }, f)).toBe(
      true,
    );
    expect(conditionMatches({ field: "payee", op: "equals", value: "farmacia" }, f)).toBe(false);
  });

  it("runs regexes on the text and its accent-free form; an invalid one never matches", () => {
    const f = tx({ description: "FARMÁCIA CENTRAL 123" });
    expect(
      conditionMatches({ field: "description", op: "regex", value: "farmacia\\s+central" }, f),
    ).toBe(true);
    expect(conditionMatches({ field: "description", op: "regex", value: "(" }, f)).toBe(false);
  });

  it("also looks at the raw description", () => {
    const f = tx({ description: "Continente", descriptionRaw: "COMPRA 1234 CONTINENTE MB" });
    expect(conditionMatches({ field: "description", op: "contains", value: "mb" }, f)).toBe(true);
  });

  it("compares the size of the amount, in minor units", () => {
    expect(conditionMatches({ field: "amount", op: "gte", value: 2000 }, tx())).toBe(true);
    expect(conditionMatches({ field: "amount", op: "lte", value: 2000 }, tx())).toBe(false);
    expect(
      conditionMatches({ field: "amount", op: "equals", value: 2350 }, tx({ amount: 2350 })),
    ).toBe(true);
  });

  it("matches account and sign", () => {
    expect(conditionMatches({ field: "account", op: "equals", value: "acc-1" }, tx())).toBe(true);
    expect(conditionMatches({ field: "account", op: "equals", value: "acc-2" }, tx())).toBe(false);
    expect(conditionMatches({ field: "sign", op: "equals", value: "expense" }, tx())).toBe(true);
    expect(conditionMatches({ field: "sign", op: "equals", value: "income" }, tx())).toBe(false);
    expect(
      conditionMatches({ field: "sign", op: "equals", value: "expense" }, tx({ amount: 0 })),
    ).toBe(false);
  });

  it("validates what can be saved", () => {
    expect(validateCondition({ field: "payee", op: "contains", value: "x" })).toBeNull();
    expect(validateCondition({ field: "payee", op: "contains", value: " " })).not.toBeNull();
    expect(validateCondition({ field: "payee", op: "gte", value: "x" })).not.toBeNull();
    expect(validateCondition({ field: "payee", op: "regex", value: "[" })).not.toBeNull();
    expect(validateCondition({ field: "amount", op: "gte", value: 12.5 })).not.toBeNull();
    expect(validateCondition({ field: "amount", op: "gte", value: -1 })).not.toBeNull();
    expect(validateCondition({ field: "sign", op: "equals", value: "x" })).not.toBeNull();
    expect(validateCondition({ field: "account", op: "contains", value: "a" })).not.toBeNull();
  });

  it("needs every condition of a rule", () => {
    const r = rule("r", 1, [
      { field: "payee", op: "contains", value: "continente" },
      { field: "amount", op: "gte", value: 5000 },
    ]);
    expect(ruleMatches(r, tx())).toBe(false);
    expect(ruleMatches(r, tx({ amount: -9000 }))).toBe(true);
    expect(ruleMatches({ conditions: [] }, tx())).toBe(false);
  });
});

describe("evaluateRules", () => {
  const groceries = "cat-groceries";
  const fuel = "cat-fuel";

  it("uses the lowest priority number first, ties by id", () => {
    const a = rule("b", 2, [{ field: "payee", op: "contains", value: "continente" }], {
      categoryId: fuel,
    });
    const b = rule("a", 1, [{ field: "payee", op: "contains", value: "continente" }], {
      categoryId: groceries,
    });
    expect(evaluateRules([a, b], tx()).categoryId).toBe(groceries);
    expect(sortRules([rule("z", 1, []), rule("y", 1, [])]).map((r) => r.id)).toEqual(["y", "z"]);
  });

  it("lets a rename or tag rule through to a later category rule", () => {
    const rename = rule("1", 1, [{ field: "payee", op: "contains", value: "continente" }], {
      payeeRename: "Continente",
      tagIds: ["t1"],
    });
    const cat = rule("2", 2, [{ field: "sign", op: "equals", value: "expense" }], {
      categoryId: groceries,
      tagIds: ["t1", "t2"],
    });
    const out = evaluateRules([cat, rename], tx());
    expect(out).toMatchObject({
      categoryId: groceries,
      ruleId: "2",
      payeeRename: "Continente",
      tagIds: ["t1", "t2"],
      matched: ["1", "2"],
    });
  });

  it("returns an empty outcome when nothing matches", () => {
    expect(
      evaluateRules(
        [rule("1", 1, [{ field: "payee", op: "equals", value: "x" }], { categoryId: fuel })],
        tx(),
      ),
    ).toEqual({
      categoryId: null,
      ruleId: null,
      payeeRename: null,
      tagIds: [],
      matched: [],
    });
  });
});

const hist = (over: Partial<HistoryTx> & { id: string }): HistoryTx => ({
  ...tx(),
  kind: "expense",
  categoryId: null,
  method: "none",
  ...over,
});

describe("previewRule and planRecategorization", () => {
  const r = rule("r", 1, [{ field: "payee", op: "contains", value: "continente" }], {
    categoryId: "cat-g",
  });
  const history: HistoryTx[] = [
    hist({ id: "1" }),
    hist({ id: "2", categoryId: "cat-g", method: "rule" }),
    hist({ id: "3", categoryId: "cat-x", method: "user" }),
    hist({ id: "4", categoryId: "cat-x", method: "ml" }),
    hist({ id: "5", payee: "Lidl", description: "LIDL" }),
    hist({ id: "6", kind: "transfer" }),
  ];

  it("counts matches, changes and what the user protects", () => {
    expect(previewRule(r, history)).toEqual({
      matches: 4,
      wouldChange: 2,
      protectedByUser: 1,
      sample: ["1", "2", "3", "4"],
    });
  });

  it("plans only changes, never over a user choice or a transfer", () => {
    const plan = planRecategorization([r], history, () => "expense");
    expect(plan.map((p) => p.id)).toEqual(["1", "4"]);
    expect(plan[0]).toEqual({ id: "1", categoryId: "cat-g", ruleId: "r" });
  });

  it("skips a category whose type contradicts the sign", () => {
    expect(planRecategorization([r], history, () => "income")).toEqual([]);
    expect(planRecategorization([r], history, () => undefined)).toEqual([]);
  });
});

describe("conditionsFromTransaction", () => {
  it("starts from the payee and the sign", () => {
    expect(conditionsFromTransaction({ payee: "Lidl", description: "x", amount: -100 })).toEqual([
      { field: "payee", op: "contains", value: "Lidl" },
      { field: "sign", op: "equals", value: "expense" },
    ]);
    expect(
      conditionsFromTransaction({ payee: " ", description: "Salary", amount: 100 })[0],
    ).toEqual({
      field: "description",
      op: "contains",
      value: "Salary",
    });
  });
});

describe("default merchant rules", () => {
  const find = (name: string) => DEFAULT_RULE_SPECS.find((s) => s.name === name);

  it("have unique names and valid conditions", () => {
    const names = DEFAULT_RULE_SPECS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const spec of DEFAULT_RULE_SPECS) {
      for (const c of defaultRuleConditions(spec)) expect(validateCondition(c)).toBeNull();
    }
  });

  it("match whole words only, with or without accents", () => {
    const match = (name: string, description: string) =>
      ruleMatches({ conditions: defaultRuleConditions(find(name) as never) }, tx({ description }));
    expect(match("EDP", "Pagamento EDP Comercial")).toBe(true);
    expect(match("EDP", "CREDPAY 123")).toBe(false);
    expect(match("BP", "BP LISBOA")).toBe(true);
    expect(match("BP", "BPI SEGUROS")).toBe(false);
    expect(match("Farmácia", "FARMÁCIA CENTRAL")).toBe(true);
    expect(match("Via Verde", "VIAVERDE 55")).toBe(true);
    expect(match("Via Verde", "Via Verde")).toBe(true);
  });

  it("do not apply to income", () => {
    expect(
      ruleMatches(
        { conditions: defaultRuleConditions(find("Continente") as never) },
        tx({ amount: 500 }),
      ),
    ).toBe(false);
  });
});

describe("categorize", () => {
  const ctx = (kind: "expense" | "income" | undefined) => ({
    rules: [
      rule("r", 1, [{ field: "payee", op: "contains", value: "continente" }], {
        categoryId: "cat-g",
        payeeRename: "Continente",
        tagIds: ["t"],
      }),
    ],
    categoryKind: () => kind,
  });

  it("takes the category of the first matching rule with its rename and tags", () => {
    expect(categorize(tx(), ctx("expense"))).toEqual({
      categoryId: "cat-g",
      method: "rule",
      confidence: 1,
      needsReview: false,
      ruleId: "r",
      payeeRename: "Continente",
      tagIds: ["t"],
    });
  });

  it("ignores a category that contradicts the sign or no longer exists, but keeps the rename", () => {
    for (const kind of ["income", undefined] as const) {
      expect(categorize(tx(), ctx(kind))).toMatchObject({
        categoryId: null,
        method: "none",
        payeeRename: "Continente",
      });
    }
  });

  it("leaves unmatched transactions alone", () => {
    expect(categorize(tx({ payee: "Zzz", description: "zzz" }), ctx("expense"))).toMatchObject({
      categoryId: null,
      method: "none",
      confidence: 0,
    });
  });
});
