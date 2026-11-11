import { describe, expect, it } from "vitest";
import { onboardingSteps } from "./steps";

describe("onboardingSteps", () => {
  it("starts with nothing done", () => {
    expect(onboardingSteps({ accounts: 0, transactions: 0 })).toEqual({
      hasAccount: false,
      hasTransactions: false,
      finished: false,
    });
  });
  it("asks for transactions once there is an account", () => {
    expect(onboardingSteps({ accounts: 1, transactions: 0 })).toMatchObject({
      hasAccount: true,
      hasTransactions: false,
      finished: false,
    });
  });
  it("finishes when both exist", () => {
    expect(onboardingSteps({ accounts: 2, transactions: 5 }).finished).toBe(true);
  });
});
