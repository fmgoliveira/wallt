import { describe, expect, it } from "vitest";
import { createRateTable, type FxRow, sumConverted } from "./fx";
import { convertCross, money } from "./money";

const row = (date: string, quote: string, rate: string): FxRow => ({
  date,
  base: "EUR",
  quote,
  rate,
});

const rows = [
  row("2026-11-02", "USD", "1.0800"),
  row("2026-11-04", "USD", "1.1000"),
  row("2026-11-06", "USD", "1.0900"),
  row("2026-11-02", "GBP", "0.8600"),
  row("2026-11-06", "GBP", "0.8700"),
  row("2026-11-06", "JPY", "165.50"),
  { date: "2026-11-06", base: "USD", quote: "CHF", rate: "0.9" }, // not an ECB row: ignored
];
const table = createRateTable(rows);

describe("convertCross", () => {
  it("converts through the base with one rounding", () => {
    // 100.00 USD -> EUR at 1.09 USD/EUR = 91.74
    expect(convertCross(money(10_000, "USD"), "EUR", "1.09", "1")).toEqual(money(9174, "EUR"));
    // 100.00 EUR -> USD
    expect(convertCross(money(10_000, "EUR"), "USD", "1", "1.09")).toEqual(money(10_900, "USD"));
    // USD -> GBP: 100 / 1.09 * 0.87 = 79.82
    expect(convertCross(money(10_000, "USD"), "GBP", "1.09", "0.87")).toEqual(money(7982, "GBP"));
  });
  it("handles currencies with different minor units and rounds half away from zero", () => {
    // 100.00 EUR -> JPY at 165.5 = 16550 yen
    expect(convertCross(money(10_000, "EUR"), "JPY", "1", "165.5")).toEqual(money(16_550, "JPY"));
    // 16550 JPY -> EUR = 100.00
    expect(convertCross(money(16_550, "JPY"), "EUR", "165.5", "1")).toEqual(money(10_000, "EUR"));
    expect(convertCross(money(-1, "EUR"), "USD", "1", "1.5")).toEqual(money(-2, "USD"));
    expect(convertCross(money(1, "EUR"), "USD", "1", "1.5")).toEqual(money(2, "USD"));
  });
  it("rejects invalid or zero rates", () => {
    expect(() => convertCross(money(1, "EUR"), "USD", "1", "x")).toThrow(RangeError);
    expect(() => convertCross(money(1, "EUR"), "USD", "0", "1")).toThrow(RangeError);
  });
});

describe("rate table", () => {
  it("uses the rate of the date", () => {
    expect(table.perBase("USD", "2026-11-04")).toEqual({ rate: "1.1000", date: "2026-11-04" });
    expect(table.convert(money(11_000, "USD"), "EUR", "2026-11-04")).toEqual(money(10_000, "EUR"));
  });
  it("falls back to the last known earlier rate (weekends, missing days)", () => {
    expect(table.perBase("USD", "2026-11-05")?.date).toBe("2026-11-04");
    expect(table.perBase("USD", "2027-01-01")?.date).toBe("2026-11-06");
  });
  it("uses the earliest known rate for dates before the history", () => {
    expect(table.perBase("USD", "2020-01-01")?.date).toBe("2026-11-02");
  });
  it("treats EUR as 1 and same-currency conversion as identity", () => {
    expect(table.perBase("EUR", "2026-11-05")).toEqual({ rate: "1", date: "2026-11-05" });
    const m = money(1234, "CAD");
    expect(table.convert(m, "CAD", "2026-11-05")).toBe(m);
  });
  it("converts between two non-base currencies", () => {
    // 2026-11-06: USD 1.09, GBP 0.87
    expect(table.convert(money(10_900, "USD"), "GBP", "2026-11-06")).toEqual(money(8700, "GBP"));
  });
  it("returns null for currencies without rates", () => {
    expect(table.convert(money(100, "CAD"), "EUR", "2026-11-06")).toBeNull();
    expect(table.perBase("CAD", "2026-11-06")).toBeNull();
    expect(table.canConvert("USD", "GBP")).toBe(true);
    expect(table.canConvert("USD", "CAD")).toBe(false);
    expect(table.canConvert("CAD", "CAD")).toBe(true);
  });
  it("reports the newest date and works when empty", () => {
    expect(table.latestDate()).toBe("2026-11-06");
    const empty = createRateTable([]);
    expect(empty.latestDate()).toBeNull();
    expect(empty.convert(money(1, "USD"), "EUR", "2026-11-06")).toBeNull();
    expect(empty.convert(money(1, "EUR"), "EUR", "2026-11-06")).toEqual(money(1, "EUR"));
  });
  it("is independent of row order", () => {
    const shuffled = createRateTable([...rows].reverse());
    expect(shuffled.perBase("USD", "2026-11-05")?.date).toBe("2026-11-04");
  });
});

describe("sumConverted", () => {
  it("converts each item at its own date and counts what it cannot convert", () => {
    const out = sumConverted(
      table,
      [
        { amount: 10_800, currency: "USD", date: "2026-11-02" }, // 100.00 EUR
        { amount: 10_900, currency: "USD", date: "2026-11-06" }, // 100.00 EUR
        { amount: 500, currency: "EUR", date: "2026-11-06" },
        { amount: 700, currency: "CAD", date: "2026-11-06" },
      ],
      "EUR",
    );
    expect(out).toEqual({ total: 10_000 + 10_000 + 500, unconverted: 1 });
  });
});
