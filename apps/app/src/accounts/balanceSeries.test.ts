import { describe, expect, it } from "vitest";
import { balanceSeries } from "./balanceSeries";

describe("balanceSeries", () => {
  it("is empty without activity", () => {
    expect(balanceSeries(100, [], "2026-11-15", "en")).toEqual([]);
  });

  it("accumulates opening balance and activity up to each date", () => {
    const s = balanceSeries(
      1000,
      [
        { date: "2026-11-01", total: 500 },
        { date: "2026-11-11", total: -200 },
      ],
      "2026-11-15",
      "en",
    );
    expect(s[0]?.value).toBe(1500);
    expect(s.at(-1)?.value).toBe(1300);
  });
});
