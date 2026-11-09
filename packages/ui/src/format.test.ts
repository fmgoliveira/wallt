import { describe, expect, it } from "vitest";
import { amountParts } from "./format";

describe("amountParts", () => {
  it("splits a pt amount (symbol after)", () => {
    const p = amountParts(123456, "EUR", "pt");
    // core groups with a non-breaking space; compare with plain spaces
    expect({ ...p, integer: p.integer.replace(/\s/g, " ") }).toEqual({
      sign: "",
      integer: "1 234",
      decimals: ",56",
      symbol: "€",
      symbolFirst: false,
    });
  });

  it("splits an en amount (symbol first)", () => {
    expect(amountParts(123456, "EUR", "en")).toEqual({
      sign: "",
      integer: "1,234",
      decimals: ".56",
      symbol: "€",
      symbolFirst: true,
    });
  });

  it("uses the true minus for outflows and an optional plus for inflows", () => {
    expect(amountParts(-4230, "EUR", "pt").sign).toBe("−");
    expect(amountParts(4230, "EUR", "pt").sign).toBe("");
    expect(amountParts(4230, "EUR", "pt", true).sign).toBe("+");
    expect(amountParts(0, "EUR", "pt", true).sign).toBe("");
  });

  it("handles zero-exponent currencies without decimals", () => {
    const p = amountParts(1500, "JPY", "en");
    expect(p.decimals).toBe("");
    expect(p.integer).toBe("1,500");
    expect(p.symbol).toBe("¥");
  });

  it("falls back to the code for currencies without a symbol", () => {
    expect(amountParts(100, "CHF", "en").symbol).toBe("CHF");
  });
});
