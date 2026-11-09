import { describe, expect, it } from "vitest";
import {
  type BudgetEntry,
  type BudgetShape,
  budgetAlertKey,
  budgetPeriodAt,
  budgetStatus,
  entriesNeededFrom,
  entryInScope,
  expandCategoryIds,
  levelFor,
  spentInPeriod,
} from "./budgets";

const none = { categoryIds: [], tagIds: [], accountIds: [] };
const month = (over: Partial<BudgetShape> = {}): BudgetShape => ({
  period: "month",
  start: "2026-01-01",
  end: null,
  amount: 30_000,
  rollover: false,
  scope: none,
  ...over,
});
const spend = (date: string, cents: number, over: Partial<BudgetEntry> = {}): BudgetEntry => ({
  date,
  amount: -cents,
  categoryId: null,
  accountId: "a1",
  tagIds: [],
  ...over,
});

describe("budgetPeriodAt", () => {
  it("returns the calendar month", () => {
    expect(budgetPeriodAt(month(), "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("returns Monday to Sunday for weeks", () => {
    // 2026-11-11 is a Wednesday.
    expect(budgetPeriodAt(month({ period: "week" }), "2026-11-11")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });
  it("clips the first and last period to start and end", () => {
    const b = month({ start: "2026-01-15", end: "2026-03-10" });
    expect(budgetPeriodAt(b, "2026-01-20")).toEqual({ from: "2026-01-15", to: "2026-01-31" });
    expect(budgetPeriodAt(b, "2026-03-05")).toEqual({ from: "2026-03-01", to: "2026-03-10" });
    expect(budgetPeriodAt(b, "2026-01-14")).toBeNull();
    expect(budgetPeriodAt(b, "2026-03-11")).toBeNull();
  });
  it("custom is one fixed period and needs an end", () => {
    const c = month({ period: "custom", start: "2026-06-01", end: "2026-06-20" });
    expect(budgetPeriodAt(c, "2026-06-10")).toEqual({ from: "2026-06-01", to: "2026-06-20" });
    expect(budgetPeriodAt(month({ period: "custom" }), "2026-06-10")).toBeNull();
  });
});

describe("scope", () => {
  const e = spend("2026-02-01", 100, { categoryId: "c1", accountId: "a1", tagIds: ["t1"] });
  it("empty lists mean no restriction", () => {
    expect(entryInScope(none, e)).toBe(true);
  });
  it("any match within a dimension, AND across dimensions", () => {
    expect(entryInScope({ ...none, categoryIds: ["c1", "c2"] }, e)).toBe(true);
    expect(entryInScope({ ...none, categoryIds: ["c2"] }, e)).toBe(false);
    expect(entryInScope({ ...none, tagIds: ["t9", "t1"] }, e)).toBe(true);
    expect(entryInScope({ ...none, tagIds: ["t9"] }, e)).toBe(false);
    expect(entryInScope({ categoryIds: ["c1"], tagIds: ["t1"], accountIds: ["a2"] }, e)).toBe(
      false,
    );
    expect(entryInScope({ categoryIds: ["c1"], tagIds: ["t1"], accountIds: ["a1"] }, e)).toBe(true);
  });
  it("uncategorised entries never match a category scope", () => {
    expect(entryInScope({ ...none, categoryIds: ["c1"] }, spend("2026-02-01", 5))).toBe(false);
  });
  it("expands categories to their descendants", () => {
    const cats = [
      { id: "food", parentId: null },
      { id: "groc", parentId: "food" },
      { id: "veg", parentId: "groc" },
      { id: "fun", parentId: null },
    ];
    expect(expandCategoryIds(["food"], cats).sort()).toEqual(["food", "groc", "veg"]);
    expect(expandCategoryIds([], cats)).toEqual([]);
    expect(expandCategoryIds(["x"], cats)).toEqual(["x"]);
  });
});

describe("spentInPeriod", () => {
  it("sums only entries in the period and scope; refunds reduce it but never below zero", () => {
    const p = { from: "2026-02-01", to: "2026-02-28" };
    const refund = { ...spend("2026-02-10", 0), amount: 300 };
    const entries = [
      spend("2026-01-31", 999),
      spend("2026-02-01", 1000),
      spend("2026-02-28", 500),
      spend("2026-03-01", 999),
      refund,
    ];
    expect(spentInPeriod(none, entries, p)).toBe(1200);
    expect(spentInPeriod(none, [refund], p)).toBe(0);
  });
});

describe("budgetStatus", () => {
  it("computes remaining, percent and safe-to-spend", () => {
    const s = budgetStatus(month(), [spend("2026-02-03", 12_000)], "2026-02-15");
    expect(s).toMatchObject({
      state: "active",
      spent: 12_000,
      remaining: 18_000,
      percent: 40,
      level: "ok",
      daysLeft: 14,
      safeToSpendPerDay: 1285,
    });
  });
  it("flags warning at 80% and over at 100%", () => {
    expect(budgetStatus(month(), [spend("2026-02-03", 24_000)], "2026-02-15")?.level).toBe(
      "warning",
    );
    expect(budgetStatus(month(), [spend("2026-02-03", 23_999)], "2026-02-15")?.level).toBe("ok");
    const over = budgetStatus(month(), [spend("2026-02-03", 30_000)], "2026-02-15");
    expect(over).toMatchObject({ level: "over", remaining: 0, safeToSpendPerDay: 0 });
    const more = budgetStatus(month(), [spend("2026-02-03", 33_000)], "2026-02-15");
    expect(more).toMatchObject({
      level: "over",
      remaining: -3000,
      percent: 110,
      safeToSpendPerDay: 0,
    });
  });
  it("levelFor thresholds", () => {
    expect(levelFor(79)).toBe("ok");
    expect(levelFor(80)).toBe("warning");
    expect(levelFor(99)).toBe("warning");
    expect(levelFor(100)).toBe("over");
  });
  it("handles a zero amount", () => {
    expect(budgetStatus(month({ amount: 0 }), [], "2026-02-15")).toMatchObject({
      percent: 0,
      level: "ok",
    });
    expect(
      budgetStatus(month({ amount: 0 }), [spend("2026-02-03", 1)], "2026-02-15"),
    ).toMatchObject({ percent: 999, level: "over" });
  });
  it("is upcoming before start and ended after end", () => {
    const b = month({ start: "2026-03-01", end: "2026-04-30" });
    expect(budgetStatus(b, [spend("2026-03-02", 500)], "2026-02-10")).toMatchObject({
      state: "upcoming",
      spent: 0,
      daysLeft: 0,
      period: { from: "2026-03-01", to: "2026-03-31" },
    });
    expect(budgetStatus(b, [spend("2026-04-02", 500)], "2026-06-10")).toMatchObject({
      state: "ended",
      spent: 500,
      safeToSpendPerDay: 0,
      period: { from: "2026-04-01", to: "2026-04-30" },
    });
  });
  it("counts the last day inclusively", () => {
    expect(budgetStatus(month(), [], "2026-02-28")?.daysLeft).toBe(1);
  });

  describe("rollover", () => {
    const b = month({ rollover: true, start: "2026-01-01" });
    it("carries unspent allowance forward", () => {
      const entries = [spend("2026-01-10", 10_000), spend("2026-02-10", 25_000)];
      // Jan: 30000 - 10000 = 20000 carried. Feb allowance 50000, spent 25000, so 25000 carries into March.
      expect(budgetStatus(b, entries, "2026-02-20")).toMatchObject({
        carry: 20_000,
        allowance: 50_000,
        remaining: 25_000,
      });
      expect(budgetStatus(b, entries, "2026-03-05")).toMatchObject({
        carry: 25_000,
        allowance: 55_000,
      });
    });
    it("does not carry an overspend", () => {
      const entries = [spend("2026-01-10", 45_000)];
      expect(budgetStatus(b, entries, "2026-02-02")).toMatchObject({
        carry: 0,
        allowance: 30_000,
      });
    });
    it("accumulates over skipped, empty periods", () => {
      expect(budgetStatus(b, [], "2026-04-02")).toMatchObject({
        carry: 90_000,
        allowance: 120_000,
      });
    });
    it("works for weeks and ignores rollover for custom budgets", () => {
      const w = month({ period: "week", rollover: true, start: "2026-11-02", amount: 10_000 });
      expect(budgetStatus(w, [spend("2026-11-03", 4000)], "2026-11-10")).toMatchObject({
        carry: 6000,
      });
      const c = month({ period: "custom", rollover: true, start: "2026-06-01", end: "2026-06-30" });
      expect(budgetStatus(c, [], "2026-06-10")?.carry).toBe(0);
    });
    it("only counts entries in scope", () => {
      const sc = { ...b, scope: { ...none, categoryIds: ["c1"] } };
      const entries = [
        spend("2026-01-10", 10_000, { categoryId: "c2" }),
        spend("2026-01-11", 5000, { categoryId: "c1" }),
      ];
      expect(budgetStatus(sc, entries, "2026-02-02")?.carry).toBe(25_000);
    });
  });

  it("honours an expanded category scope", () => {
    const b = month({ scope: { ...none, categoryIds: ["food"] } });
    const e = [spend("2026-02-05", 1000, { categoryId: "groc" })];
    expect(budgetStatus(b, e, "2026-02-06")?.spent).toBe(0);
    expect(budgetStatus(b, e, "2026-02-06", ["food", "groc"])?.spent).toBe(1000);
  });

  it("returns null for a custom budget with no end", () => {
    expect(budgetStatus(month({ period: "custom" }), [], "2026-02-06")).toBeNull();
  });
});

describe("entriesNeededFrom / alert key", () => {
  it("is the budget start with rollover, else the current period start", () => {
    expect(entriesNeededFrom(month({ rollover: true }), "2026-05-20")).toBe("2026-01-01");
    expect(entriesNeededFrom(month(), "2026-05-20")).toBe("2026-05-01");
    expect(entriesNeededFrom(month({ start: "2026-08-01" }), "2026-05-20")).toBe("2026-08-01");
  });
  it("builds a stable alert key", () => {
    expect(budgetAlertKey("b1", { from: "2026-02-01", to: "2026-02-28" }, "warning")).toBe(
      "budget:b1:2026-02-01:warning",
    );
  });
});
