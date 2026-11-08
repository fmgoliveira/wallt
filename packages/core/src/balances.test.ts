import { describe, expect, it } from "vitest";
import { netWorthByCurrency } from "./balances";

const acc = (
  currency: string,
  balance: number,
  over: { includeInNetWorth?: boolean; archived?: boolean } = {},
) => ({
  currency,
  balance,
  includeInNetWorth: true,
  archived: false,
  ...over,
});

describe("netWorthByCurrency", () => {
  it("sums per currency in first-seen order", () => {
    expect(netWorthByCurrency([acc("EUR", 1000), acc("USD", 50), acc("EUR", -250)])).toEqual([
      { amount: 750, currency: "EUR" },
      { amount: 50, currency: "USD" },
    ]);
  });

  it("skips archived and opted-out accounts", () => {
    expect(
      netWorthByCurrency([
        acc("EUR", 1000),
        acc("EUR", 5000, { archived: true }),
        acc("EUR", 7000, { includeInNetWorth: false }),
      ]),
    ).toEqual([{ amount: 1000, currency: "EUR" }]);
  });

  it("is empty when nothing counts", () => {
    expect(netWorthByCurrency([])).toEqual([]);
    expect(netWorthByCurrency([acc("EUR", 1, { archived: true })])).toEqual([]);
  });

  it("stays exact for large balances", () => {
    expect(netWorthByCurrency([acc("EUR", 9_000_000_000_000), acc("EUR", 3)])[0]?.amount).toBe(
      9_000_000_000_003,
    );
  });
});
