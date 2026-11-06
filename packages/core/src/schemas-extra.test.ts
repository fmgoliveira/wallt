import { describe, expect, it } from "vitest";
import {
  attachmentSchema,
  budgetSchema,
  debtSchema,
  fxRateSchema,
  goalSchema,
  importProfileSchema,
  payeeAliasSchema,
  recurringRuleSchema,
  ruleSchema,
} from "./schemas-extra";

const id = "0190a5c4-7b1e-7a3f-8c2d-123456789abc";
const base = {
  id,
  userId: "u1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  hlc: "h",
  deletedAt: null,
  serverSeq: null,
};
const scope = { categoryIds: [id], tagIds: [], accountIds: [] };
const budget = {
  ...base,
  name: "Food",
  period: "month",
  start: "2024-01-01",
  end: null,
  amount: 30000,
  currency: "EUR",
  rollover: false,
  scope,
};

describe("extra schemas", () => {
  it("budget", () => {
    expect(budgetSchema.safeParse(budget).success).toBe(true);
    expect(budgetSchema.safeParse({ ...budget, amount: -1 }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...budget, end: "2023-12-31" }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...budget, period: "custom" }).success).toBe(false);
    expect(budgetSchema.safeParse({ ...budget, period: "custom", end: "2024-02-01" }).success).toBe(
      true,
    );
  });
  it("recurring rule", () => {
    const r = {
      ...base,
      template: { payee: "EDP", amount: -5000, currency: "EUR", accountId: id, categoryId: null },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      nextDate: "2024-02-05",
      autoDetected: false,
      active: true,
    };
    expect(recurringRuleSchema.safeParse(r).success).toBe(true);
    expect(recurringRuleSchema.safeParse({ ...r, rrule: "" }).success).toBe(false);
  });
  it("goal and debt", () => {
    const g = {
      ...base,
      name: "Trip",
      targetAmount: 100000,
      currency: "EUR",
      deadline: null,
      accountIds: [id],
      color: null,
    };
    expect(goalSchema.safeParse(g).success).toBe(true);
    expect(goalSchema.safeParse({ ...g, targetAmount: 0 }).success).toBe(false);
    const d = {
      ...base,
      person: "Ana",
      direction: "lent",
      amount: 2000,
      currency: "EUR",
      settled: false,
    };
    expect(debtSchema.safeParse(d).success).toBe(true);
    expect(debtSchema.safeParse({ ...d, direction: "x" }).success).toBe(false);
  });
  it("rule, alias, attachment", () => {
    const rule = {
      ...base,
      name: "Groceries",
      conditions: [{ field: "payee", op: "contains", value: "lidl" }],
      action: { categoryId: id },
      priority: 1,
    };
    expect(ruleSchema.safeParse(rule).success).toBe(true);
    expect(ruleSchema.safeParse({ ...rule, conditions: [] }).success).toBe(false);
    expect(payeeAliasSchema.safeParse({ ...base, pattern: "LIDL.*", payee: "Lidl" }).success).toBe(
      true,
    );
    expect(
      attachmentSchema.safeParse({
        ...base,
        transactionId: id,
        filePath: "a/b.pdf",
        mime: "application/pdf",
      }).success,
    ).toBe(true);
  });
  it("fx rate keeps rate as decimal string", () => {
    const fx = { date: "2024-01-02", base: "EUR", quote: "USD", rate: "1.0837" };
    expect(fxRateSchema.safeParse(fx).success).toBe(true);
    expect(fxRateSchema.safeParse({ ...fx, rate: 1.0837 }).success).toBe(false);
    expect(fxRateSchema.safeParse({ ...fx, rate: "-1" }).success).toBe(false);
  });
});

describe("import profile", () => {
  it("requires a fingerprint and accepts opaque config", () => {
    const p = {
      ...base,
      name: "BCP",
      institution: null,
      defaultAccountId: null,
      fingerprints: ["abc"],
      config: { delimiter: ";" },
    };
    expect(importProfileSchema.safeParse(p).success).toBe(true);
    expect(importProfileSchema.safeParse({ ...p, fingerprints: [] }).success).toBe(false);
  });
});
