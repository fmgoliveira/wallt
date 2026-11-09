import { describe, expect, it } from "vitest";
import { createRateTable } from "./fx";
import {
  bucketFor,
  bucketRange,
  bucketStart,
  calendarHeat,
  cashflowSeries,
  categoryTrend,
  incomeVsExpense,
  netWorthSeries,
  REPORT_PERIODS,
  type ReportEntry,
  reportRange,
  spendingByCategory,
  topPayees,
} from "./reports";

const table = createRateTable([
  { date: "2026-11-01", base: "EUR", quote: "USD", rate: "1.25" },
  { date: "2026-11-15", base: "EUR", quote: "USD", rate: "2" },
]);

const e = (date: string, amount: number, over: Partial<ReportEntry> = {}): ReportEntry => ({
  date,
  amount,
  currency: "EUR",
  kind: amount < 0 ? "expense" : "income",
  categoryId: null,
  accountId: "a1",
  payee: "",
  tagIds: [],
  ...over,
});

describe("buckets", () => {
  it("starts weeks on Monday and months on the 1st", () => {
    expect(bucketStart("2026-11-11", "week")).toBe("2026-11-09"); // Wednesday
    expect(bucketStart("2026-11-09", "week")).toBe("2026-11-09");
    expect(bucketStart("2026-11-15", "week")).toBe("2026-11-09"); // Sunday
    expect(bucketStart("2026-11-11", "month")).toBe("2026-11-01");
    expect(bucketStart("2026-11-11", "day")).toBe("2026-11-11");
  });
  it("lists every bucket in a range", () => {
    expect(bucketRange("2026-09-15", "2026-11-02", "month")).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(bucketRange("2026-11-02", "2026-11-16", "week")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    expect(bucketRange("2026-11-30", "2026-12-02", "day")).toHaveLength(3);
  });
  it("picks a readable bucket size", () => {
    expect(bucketFor({ from: "2026-11-01", to: "2026-11-30" })).toBe("day");
    expect(bucketFor({ from: "2026-09-01", to: "2026-11-30" })).toBe("week");
    expect(bucketFor({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
  });
});

describe("periods", () => {
  it("resolves every period", () => {
    const today = "2026-11-09";
    expect(reportRange("month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(reportRange("last-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(reportRange("3m", today)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(reportRange("6m", today)).toEqual({ from: "2026-06-01", to: "2026-11-30" });
    expect(reportRange("12m", today)).toEqual({ from: "2025-12-01", to: "2026-11-30" });
    expect(reportRange("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(REPORT_PERIODS).toHaveLength(6);
  });
});

describe("spendingByCategory", () => {
  const cats = [
    { id: "food", parentId: null },
    { id: "groc", parentId: "food" },
    { id: "fun", parentId: null },
  ];
  const entries = [
    e("2026-11-02", -1000, { categoryId: "groc" }),
    e("2026-11-03", -500, { categoryId: "food" }),
    e("2026-11-04", -700, { categoryId: "fun" }),
    e("2026-11-05", -300),
    e("2026-11-06", 9000), // income ignored
  ];
  it("rolls subcategories into their parent, largest first", () => {
    const r = spendingByCategory(entries, table, "EUR", cats);
    expect(r.value).toEqual([
      { categoryId: "food", total: 1500 },
      { categoryId: "fun", total: 700 },
      { categoryId: null, total: 300 },
    ]);
    expect(r.unconverted).toBe(0);
  });
  it("keeps subcategories apart without rollup", () => {
    const r = spendingByCategory(entries, table, "EUR", cats, false);
    expect(r.value.map((x) => x.categoryId)).toEqual(["groc", "fun", "food", null]);
  });
  it("converts at each entry's date and counts what it cannot convert", () => {
    const r = spendingByCategory(
      [
        e("2026-11-02", -1250, { currency: "USD", categoryId: "fun" }), // /1.25 = 1000
        e("2026-11-20", -1000, { currency: "USD", categoryId: "fun" }), // /2 = 500
        e("2026-11-20", -999, { currency: "CAD", categoryId: "fun" }),
      ],
      table,
      "EUR",
    );
    expect(r.value).toEqual([{ categoryId: "fun", total: 1500 }]);
    expect(r.unconverted).toBe(1);
  });
  it("drops categories whose refunds cancel the spending", () => {
    const r = spendingByCategory(
      [
        e("2026-11-02", -500, { categoryId: "fun" }),
        e("2026-11-03", 500, { categoryId: "fun", kind: "expense" }),
      ],
      table,
      "EUR",
    );
    expect(r.value).toEqual([]);
  });
});

describe("incomeVsExpense / cashflow", () => {
  const range = { from: "2026-09-01", to: "2026-11-30" };
  const entries = [
    e("2026-09-10", 200_000),
    e("2026-09-12", -50_000),
    e("2026-10-10", 200_000),
    e("2026-10-20", -250_000),
    e("2026-11-05", -10_000),
    e("2027-01-01", -1), // outside the range
  ];
  it("buckets by month with empty buckets present", () => {
    const r = incomeVsExpense(entries, table, "EUR", range);
    expect(r.value).toEqual([
      { date: "2026-09-01", income: 200_000, expense: 50_000, net: 150_000 },
      { date: "2026-10-01", income: 200_000, expense: 250_000, net: -50_000 },
      { date: "2026-11-01", income: 0, expense: 10_000, net: -10_000 },
    ]);
    const empty = incomeVsExpense([], table, "EUR", range);
    expect(empty.value.map((p) => p.net)).toEqual([0, 0, 0]);
  });
  it("builds the running cashflow", () => {
    const flow = incomeVsExpense(entries, table, "EUR", range).value;
    expect(cashflowSeries(flow).map((p) => p.cumulative)).toEqual([150_000, 100_000, 90_000]);
  });
  it("buckets by week and counts unconverted entries", () => {
    const r = incomeVsExpense(
      [e("2026-11-03", -100), e("2026-11-10", -200), e("2026-11-10", -5, { currency: "CAD" })],
      table,
      "EUR",
      { from: "2026-11-02", to: "2026-11-15" },
      "week",
    );
    expect(r.value.map((p) => p.expense)).toEqual([100, 200]);
    expect(r.unconverted).toBe(1);
  });
});

describe("netWorthSeries", () => {
  const accounts = [
    { id: "a1", currency: "EUR", openingBalance: 100_000, includeInNetWorth: true },
    { id: "a2", currency: "USD", openingBalance: 25_000, includeInNetWorth: true },
    { id: "a3", currency: "EUR", openingBalance: 999_999, includeInNetWorth: false },
  ];
  const daily = [
    { date: "2026-11-05", accountId: "a1", total: -10_000 },
    { date: "2026-11-20", accountId: "a1", total: 5000 },
    { date: "2026-11-20", accountId: "a2", total: 25_000 },
    { date: "2026-11-05", accountId: "a3", total: 1 },
  ];
  it("sums included accounts up to each date at that date's rate", () => {
    const r = netWorthSeries(accounts, daily, table, "EUR", [
      "2026-11-01",
      "2026-11-10",
      "2026-11-20",
    ]);
    expect(r.value).toEqual([
      { date: "2026-11-01", value: 100_000 + 20_000 }, // 25000 USD / 1.25
      { date: "2026-11-10", value: 90_000 + 20_000 },
      { date: "2026-11-20", value: 95_000 + 25_000 }, // 50000 USD / 2
    ]);
    expect(r.unconverted).toBe(0);
  });
  it("leaves accounts without a rate out and says so", () => {
    const r = netWorthSeries(
      [{ id: "c", currency: "CAD", openingBalance: 500, includeInNetWorth: true }, ...accounts],
      [],
      table,
      "EUR",
      ["2026-11-01"],
    );
    expect(r.value[0]?.value).toBe(120_000);
    expect(r.unconverted).toBe(1);
  });
});

describe("categoryTrend", () => {
  it("totals the chosen categories per bucket", () => {
    const r = categoryTrend(
      [
        e("2026-10-02", -100, { categoryId: "food" }),
        e("2026-10-03", -50, { categoryId: "groc" }),
        e("2026-11-02", -400, { categoryId: "fun" }),
        e("2026-11-03", -70, { categoryId: "food" }),
      ],
      table,
      "EUR",
      ["food", "groc"],
      { from: "2026-10-01", to: "2026-11-30" },
    );
    expect(r.value).toEqual([
      { date: "2026-10-01", total: 150 },
      { date: "2026-11-01", total: 70 },
    ]);
  });
});

describe("calendarHeat", () => {
  it("assigns quartile levels to the days with spending", () => {
    const amounts = [100, 200, 300, 400, 500, 600, 700, 800];
    const entries = amounts.map((a, i) => e(`2026-11-${String(i + 1).padStart(2, "0")}`, -a));
    const r = calendarHeat(entries, table, "EUR", { from: "2026-11-01", to: "2026-11-10" });
    expect(r.value.map((d) => d.level)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 0, 0]);
    expect(r.value[0]).toEqual({ date: "2026-11-01", total: 100, level: 1 });
    expect(r.value[9]?.total).toBe(0);
  });
  it("is all zero without spending", () => {
    const r = calendarHeat([e("2026-11-02", 500)], table, "EUR", {
      from: "2026-11-01",
      to: "2026-11-03",
    });
    expect(r.value.every((d) => d.level === 0 && d.total === 0)).toBe(true);
  });
});

describe("topPayees", () => {
  it("merges spellings, shows the most common one and ranks by total", () => {
    const entries = [
      e("2026-11-02", -500, { payee: "Continente" }),
      e("2026-11-03", -300, { payee: "continente " }),
      e("2026-11-04", -200, { payee: "Continente" }),
      e("2026-11-05", -900, { payee: "Rent" }),
      e("2026-11-06", -50, { payee: "  " }),
      e("2026-11-07", 700, { payee: "Employer" }),
    ];
    const r = topPayees(entries, table, "EUR");
    expect(r.value).toEqual(
      [
        { payee: "Rent", total: 900, count: 1 },
        { payee: "Continente", total: 1000, count: 3 },
      ].sort((a, b) => b.total - a.total),
    );
    expect(topPayees(entries, table, "EUR", 1).value).toHaveLength(1);
  });
  it("counts unconvertible entries", () => {
    const r = topPayees([e("2026-11-02", -5, { payee: "X", currency: "CAD" })], table, "EUR");
    expect(r).toEqual({ value: [], unconverted: 1 });
  });
});
