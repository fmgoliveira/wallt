import { describe, expect, it } from "vitest";
import { splitsError, splitsRemaining, splitsTotal, transferLegs } from "./splits";

describe("splits", () => {
  it("accepts no splits and exact sums", () => {
    expect(splitsError(-1000, [])).toBeNull();
    expect(splitsError(-1000, [{ amount: -600 }, { amount: -400 }])).toBeNull();
    expect(splitsError(1000, [{ amount: 1500 }, { amount: -500 }])).toBeNull();
  });

  it("rejects sums that are off by even one minor unit", () => {
    expect(splitsError(-1000, [{ amount: -600 }, { amount: -399 }])).toMatch(/add up/);
    expect(splitsError(-1000, [{ amount: -600 }, { amount: -401 }])).toMatch(/add up/);
  });

  it("rejects non-integer amounts, which would hide float drift", () => {
    expect(splitsError(-10, [{ amount: -5.5 }, { amount: -4.5 }])).toMatch(/whole/);
  });

  it("is exact where floats are not", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in minor units this is 10 + 20 === 30
    expect(splitsError(30, [{ amount: 10 }, { amount: 20 }])).toBeNull();
    expect(splitsTotal([{ amount: 10 }, { amount: 20 }])).toBe(30);
  });

  it("reports what is left to allocate", () => {
    expect(splitsRemaining(-1000, [{ amount: -250 }])).toBe(-750);
    expect(splitsRemaining(-1000, [{ amount: -1000 }])).toBe(0);
  });
});

describe("transferLegs", () => {
  it("makes two legs that cancel out", () => {
    const legs = transferLegs(2550);
    expect(legs).toEqual({ from: -2550, to: 2550 });
    expect(legs.from + legs.to).toBe(0);
  });

  it("requires a positive whole amount", () => {
    expect(() => transferLegs(0)).toThrow(RangeError);
    expect(() => transferLegs(-5)).toThrow(RangeError);
    expect(() => transferLegs(1.5)).toThrow(RangeError);
  });
});
