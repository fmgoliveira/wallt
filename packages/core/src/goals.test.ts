import { describe, expect, it } from "vitest";
import { debtProgress, goalProgress } from "./goals";

const goal = (over: Record<string, unknown> = {}) => ({
  targetAmount: 100_000,
  currency: "EUR",
  deadline: null as string | null,
  accountIds: ["a1", "a2"],
  ...over,
});
const accounts = [
  { id: "a1", currency: "EUR", balance: 30_000 },
  { id: "a2", currency: "EUR", balance: 20_000 },
  { id: "a3", currency: "EUR", balance: 999_999 },
  { id: "us", currency: "USD", balance: 50_000 },
];

describe("goalProgress", () => {
  it("sums the linked accounts only", () => {
    expect(goalProgress(goal(), accounts, "2026-11-09")).toMatchObject({
      state: "active",
      saved: 50_000,
      remaining: 50_000,
      percent: 50,
      ignoredAccounts: 0,
      daysLeft: null,
      neededPerMonth: 0,
    });
  });
  it("ignores accounts in another currency and counts them", () => {
    const p = goalProgress(goal({ accountIds: ["a1", "us"] }), accounts, "2026-11-09");
    expect(p).toMatchObject({ saved: 30_000, ignoredAccounts: 1 });
  });
  it("does not double count a repeated account and skips unknown ones", () => {
    const p = goalProgress(goal({ accountIds: ["a1", "a1", "gone"] }), accounts, "2026-11-09");
    expect(p.saved).toBe(30_000);
  });
  it("never reports negative savings", () => {
    const p = goalProgress(
      goal({ accountIds: ["debt"] }),
      [{ id: "debt", currency: "EUR", balance: -5000 }],
      "2026-11-09",
    );
    expect(p).toMatchObject({ saved: 0, percent: 0, remaining: 100_000 });
  });
  it("is reached at or above the target, with the percent capped", () => {
    const p = goalProgress(goal({ accountIds: ["a3"] }), accounts, "2026-11-09");
    expect(p).toMatchObject({ state: "reached", remaining: 0, percent: 100, neededPerMonth: 0 });
    expect(
      goalProgress(goal({ targetAmount: 30_000, accountIds: ["a1"] }), accounts, "2026-11-09")
        .state,
    ).toBe("reached");
  });
  it("works out what to set aside per month until the deadline, rounding up", () => {
    // 50_000 left, 90 days = 3 months
    const p = goalProgress(goal({ deadline: "2027-02-07" }), accounts, "2026-11-09");
    expect(p).toMatchObject({ daysLeft: 90, neededPerMonth: 16_667, state: "active" });
    // under a month still counts as one month
    expect(
      goalProgress(goal({ deadline: "2026-11-12" }), accounts, "2026-11-09").neededPerMonth,
    ).toBe(50_000);
  });
  it("is overdue once the deadline passed without reaching the target", () => {
    const p = goalProgress(goal({ deadline: "2026-11-01" }), accounts, "2026-11-09");
    expect(p).toMatchObject({ state: "overdue", daysLeft: -8, neededPerMonth: 0 });
    expect(goalProgress(goal({ deadline: "2026-11-09" }), accounts, "2026-11-09")).toMatchObject({
      state: "active",
      daysLeft: 0,
      neededPerMonth: 0,
    });
  });
});

describe("debtProgress", () => {
  it("derives outstanding and percent from repayments", () => {
    expect(debtProgress({ amount: 10_000, settled: false }, 2500)).toEqual({
      repaid: 2500,
      outstanding: 7500,
      overpaid: 0,
      percent: 25,
      settled: false,
      canSettle: false,
    });
  });
  it("offers to settle a fully repaid debt and reports overpayment", () => {
    expect(debtProgress({ amount: 10_000, settled: false }, 10_500)).toMatchObject({
      outstanding: 0,
      overpaid: 500,
      percent: 100,
      settled: true,
      canSettle: true,
    });
  });
  it("honours a manual settle and clamps negative input", () => {
    expect(debtProgress({ amount: 10_000, settled: true }, 100)).toMatchObject({
      settled: true,
      canSettle: false,
    });
    expect(debtProgress({ amount: 10_000, settled: false }, -50)).toMatchObject({
      repaid: 0,
      percent: 0,
    });
  });
});
