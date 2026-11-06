import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  convert,
  currencyExponent,
  formatAmount,
  money,
  negate,
  parseAmount,
  split,
  subtract,
  sum,
} from "./money";

const eur = (n: number) => money(n, "EUR");

describe("money basics", () => {
  it("validates inputs", () => {
    expect(() => money(1.5, "EUR")).toThrow();
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "EUR")).toThrow();
    expect(() => money(1, "eur")).toThrow();
    expect(() => currencyExponent("EU")).toThrow();
  });
  it("exponents", () => {
    expect([currencyExponent("EUR"), currencyExponent("JPY"), currencyExponent("BHD")]).toEqual([
      2, 0, 3,
    ]);
  });
  it("add/subtract/negate/sum/compare", () => {
    expect(add(eur(10), eur(5))).toEqual(eur(15));
    expect(subtract(eur(10), eur(15))).toEqual(eur(-5));
    expect(negate(eur(0)).amount).toBe(0);
    expect(Object.is(negate(eur(0)).amount, -0)).toBe(false);
    expect(negate(eur(7))).toEqual(eur(-7));
    expect(sum([eur(1), eur(2)], "EUR")).toEqual(eur(3));
    expect(sum([], "EUR")).toEqual(eur(0));
    expect([compare(eur(1), eur(2)), compare(eur(2), eur(2)), compare(eur(3), eur(2))]).toEqual([
      -1, 0, 1,
    ]);
  });
  it("rejects currency mismatch and overflow", () => {
    expect(() => add(eur(1), money(1, "USD"))).toThrow(TypeError);
    expect(() => subtract(eur(1), money(1, "USD"))).toThrow(TypeError);
    expect(() => compare(eur(1), money(1, "USD"))).toThrow(TypeError);
    expect(() => add(eur(Number.MAX_SAFE_INTEGER), eur(1))).toThrow();
  });
});

describe("allocate / split", () => {
  it("sums exactly and uses largest remainder", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(5, [3, 7])).toEqual([2, 3]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(2, [2, 1])).toEqual([1, 1]);
    expect(allocate(10, [3, 2, 1])).toEqual([5, 3, 2]);
    expect(allocate(10, [1, 2, 3])).toEqual([2, 3, 5]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(10, [0, 1])).toEqual([0, 10]);
  });
  it("handles huge totals without overflow", () => {
    const parts = allocate(Number.MAX_SAFE_INTEGER, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("validates", () => {
    expect(() => allocate(1, [])).toThrow();
    expect(() => allocate(1, [0, 0])).toThrow();
    expect(() => allocate(1, [-1, 2])).toThrow();
    expect(() => allocate(1.2, [1])).toThrow();
    expect(() => split(1, 0)).toThrow();
  });
  it("split", () => {
    expect(split(10, 3)).toEqual([4, 3, 3]);
  });
});

describe("convert", () => {
  it("converts with decimal-string rate and rounds half away from zero", () => {
    expect(convert(eur(1000), "USD", "1.0837")).toEqual(money(1084, "USD"));
    expect(convert(eur(-1000), "USD", "1.0837")).toEqual(money(-1084, "USD"));
    expect(convert(eur(10), "USD", "0.5")).toEqual(money(5, "USD"));
    expect(convert(eur(1), "USD", "0.5")).toEqual(money(1, "USD"));
    expect(convert(eur(-1), "USD", "0.5")).toEqual(money(-1, "USD"));
    expect(convert(eur(1), "USD", "0.4")).toEqual(money(0, "USD"));
  });
  it("adjusts for different exponents", () => {
    expect(convert(eur(1000), "JPY", "160")).toEqual(money(1600, "JPY"));
    expect(convert(money(1600, "JPY"), "EUR", "0.00625")).toEqual(eur(1000));
    expect(convert(eur(100), "BHD", "0.4")).toEqual(money(400, "BHD"));
  });
  it("rejects bad rates", () => {
    expect(() => convert(eur(1), "USD", "abc")).toThrow();
    expect(() => convert(eur(1), "USD", "-1")).toThrow();
    expect(() => convert(eur(1), "USD", "0")).toThrow();
    expect(() => convert(eur(Number.MAX_SAFE_INTEGER), "USD", "10")).toThrow();
  });
});

describe("parseAmount", () => {
  it.each([
    ["1.234,56", "auto", 123456],
    ["1,234.56", "auto", 123456],
    ["-12,30", "auto", -1230],
    ["12,30-", "auto", -1230],
    ["(12,30)", "auto", -1230],
    ["−12.30", "auto", -1230],
    ["+5", "auto", 500],
    ["€ 1 234,5", "auto", 123450],
    ["12", "auto", 1200],
    ["0,05", "auto", 5],
    [",5", "auto", 50],
    ["12,00", "auto", 1200],
    ["12,500", "auto", 1250000],
    ["1.234", "auto", 123400],
    ["1.234", "pt", 123400],
    ["1,234", "en", 123400],
    ["1.234.567", "auto", 123456700],
    ["12.5", "auto", 1250],
    ["EUR 3.50", "auto", 350],
  ] as const)("parses %s (%s)", (input, locale, expected) => {
    expect(parseAmount(input, "EUR", locale)).toBe(expected);
  });
  it("handles other exponents", () => {
    expect(parseAmount("1.234", "JPY")).toBe(1234);
    expect(parseAmount("1.234", "BHD")).toBe(1234);
    expect(parseAmount("1,5", "BHD")).toBe(1500);
  });
  it("is exact for values that break floats", () => {
    expect(parseAmount("0,29", "EUR")).toBe(29);
    expect(parseAmount("1.005,00", "EUR")).toBe(100500);
  });
  it("rejects garbage and excess decimals", () => {
    expect(() => parseAmount("1.234", "EUR", "en")).toThrow();
    expect(() => parseAmount("1,234", "EUR", "pt")).toThrow();
    expect(() => parseAmount("abc", "EUR")).toThrow();
    expect(() => parseAmount("", "EUR")).toThrow();
    expect(() => parseAmount("1,2,3", "EUR")).toThrow();
    expect(() => parseAmount("1,234", "JPY", "pt")).toThrow();
    expect(() => parseAmount("0,001", "EUR", "pt")).toThrow();
  });
  it("accepts trailing zero decimals beyond the exponent", () => {
    expect(parseAmount("1,2300", "EUR", "pt")).toBe(123);
  });
  it("round-trips with formatAmount", () => {
    for (const n of [0, 1, -1, 99, 100, 123456, -987654321]) {
      expect(parseAmount(formatAmount(eur(n), "pt"), "EUR", "pt")).toBe(n);
      expect(parseAmount(formatAmount(eur(n), "en"), "EUR", "en")).toBe(n);
    }
  });
});

describe("formatAmount", () => {
  it("formats pt and en", () => {
    expect(formatAmount(eur(123456), "pt")).toBe("1 234,56 €");
    expect(formatAmount(eur(-5), "pt")).toBe("-0,05 €");
    expect(formatAmount(eur(123456), "en")).toBe("€1,234.56");
    expect(formatAmount(eur(-123456), "en")).toBe("-€1,234.56");
    expect(formatAmount(money(1234, "JPY"), "en")).toBe("¥1,234");
    expect(formatAmount(money(1234, "CHF"), "en")).toBe("CHF 12.34");
    expect(formatAmount(money(1234, "BHD"), "pt")).toBe("1,234 BHD");
    expect(formatAmount(eur(0))).toBe("0,00 €");
  });
});
