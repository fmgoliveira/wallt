import { addDays, addMonths, type CalendarDate, diffDays, endOfMonth, startOfMonth } from "./dates";
import type { RateTable } from "./fx";
import { money } from "./money";

/**
 * Report aggregation (PLAN §1.3). Pure functions over flat entries: every amount is converted to the report
 * currency at the rate of its own date (`RateTable`), integer minor units throughout. Entries in a currency that
 * has no rate yet are not guessed: they are counted in `unconverted` so the UI can say the total is short.
 */

export interface ReportEntry {
  date: CalendarDate;
  /** Signed minor units in `currency`. */
  amount: number;
  currency: string;
  kind: "income" | "expense";
  categoryId: string | null;
  accountId: string;
  payee: string;
  tagIds: readonly string[];
}

export interface Converted<T> {
  value: T;
  /** Entries left out because their currency has no rate. */
  unconverted: number;
}

interface Converter {
  at(entry: Pick<ReportEntry, "amount" | "currency" | "date">): number | null;
}

function converter(table: RateTable, to: string): Converter {
  return {
    at: (e) => table.convert(money(e.amount, e.currency), to, e.date)?.amount ?? null,
  };
}

/** Day / week (Monday) / month bucket key of a date: `YYYY-MM-DD` of the bucket start. */
export type Bucket = "day" | "week" | "month";

export function bucketStart(date: CalendarDate, bucket: Bucket): CalendarDate {
  if (bucket === "month") return startOfMonth(date);
  if (bucket === "day") return date;
  // Monday of the week, using a reference Monday (1970-01-05) so there is no Date/timezone involved.
  const sinceMonday = (((diffDays("1970-01-05", date) % 7) + 7) % 7) as number;
  return addDays(date, -sinceMonday);
}

/** Bucket starts covering `from`..`to` inclusive, oldest first (empty buckets included). */
export function bucketRange(from: CalendarDate, to: CalendarDate, bucket: Bucket): CalendarDate[] {
  const out: CalendarDate[] = [];
  let cursor = bucketStart(from, bucket);
  while (cursor <= to && out.length < 4000) {
    out.push(cursor);
    cursor = bucket === "month" ? addMonths(cursor, 1) : addDays(cursor, bucket === "week" ? 7 : 1);
  }
  return out;
}

/* ------------------------------------------------------------ spending by category */

export interface CategoryRef {
  id: string;
  parentId: string | null;
}

export interface CategoryTotal {
  /** Null = uncategorised. */
  categoryId: string | null;
  /** Positive spending in the report currency. */
  total: number;
}

/**
 * Spending per category, largest first. With `rollup`, subcategories count towards their parent so the donut reads at
 * one level. Refunds inside a category reduce it; categories that net to zero or less are dropped.
 */
export function spendingByCategory(
  entries: readonly ReportEntry[],
  table: RateTable,
  to: string,
  categories: readonly CategoryRef[] = [],
  rollup = true,
): Converted<CategoryTotal[]> {
  const conv = converter(table, to);
  const parent = new Map(categories.map((c) => [c.id, c.parentId]));
  const totals = new Map<string | null, number>();
  let unconverted = 0;
  for (const e of entries) {
    if (e.kind !== "expense") continue;
    const amount = conv.at(e);
    if (amount === null) {
      unconverted += 1;
      continue;
    }
    const own = e.categoryId;
    const key = rollup && own ? (parent.get(own) ?? own) : own;
    totals.set(key, (totals.get(key) ?? 0) - amount);
  }
  const value = [...totals.entries()]
    .filter(([, total]) => total > 0)
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total || String(a.categoryId).localeCompare(String(b.categoryId)));
  return { value, unconverted };
}

/* ---------------------------------------------------------- income vs expense / cashflow */

export interface FlowPoint {
  /** Bucket start date. */
  date: CalendarDate;
  income: number;
  /** Positive spending. */
  expense: number;
  /** `income - expense`. */
  net: number;
}

/** Income and spending per bucket over `from`..`to` (every bucket present, zero when empty). */
export function incomeVsExpense(
  entries: readonly ReportEntry[],
  table: RateTable,
  to: string,
  range: { from: CalendarDate; to: CalendarDate },
  bucket: Bucket = "month",
): Converted<FlowPoint[]> {
  const conv = converter(table, to);
  const points = new Map<CalendarDate, FlowPoint>(
    bucketRange(range.from, range.to, bucket).map((date) => [
      date,
      { date, income: 0, expense: 0, net: 0 },
    ]),
  );
  let unconverted = 0;
  for (const e of entries) {
    if (e.date < range.from || e.date > range.to) continue;
    const amount = conv.at(e);
    if (amount === null) {
      unconverted += 1;
      continue;
    }
    const p = points.get(bucketStart(e.date, bucket));
    if (!p) continue;
    if (e.kind === "income") p.income += amount;
    else p.expense -= amount;
  }
  const value = [...points.values()];
  for (const p of value) p.net = p.income - p.expense;
  return { value, unconverted };
}

export interface CumulativePoint {
  date: CalendarDate;
  net: number;
  /** Running total of `net` from the start of the range. */
  cumulative: number;
}

/** Net cashflow per bucket plus its running total. */
export function cashflowSeries(flow: readonly FlowPoint[]): CumulativePoint[] {
  let cumulative = 0;
  return flow.map((p) => {
    cumulative += p.net;
    return { date: p.date, net: p.net, cumulative };
  });
}

/* ---------------------------------------------------------------------- net worth */

export interface WorthAccount {
  id: string;
  currency: string;
  openingBalance: number;
  includeInNetWorth: boolean;
}

/** All activity of an account on one day (transfers included), in the account's currency. */
export interface DailyTotal {
  date: CalendarDate;
  accountId: string;
  total: number;
}

export interface WorthPoint {
  date: CalendarDate;
  value: number;
}

/**
 * Net worth at each of `dates` (sorted ascending): the sum over included accounts of opening balance plus activity
 * up to and including that date, each account converted at that date's rate.
 */
export function netWorthSeries(
  accounts: readonly WorthAccount[],
  daily: readonly DailyTotal[],
  table: RateTable,
  to: string,
  dates: readonly CalendarDate[],
): Converted<WorthPoint[]> {
  const included = accounts.filter((a) => a.includeInNetWorth);
  const byAccount = new Map<string, DailyTotal[]>();
  for (const d of daily) {
    const list = byAccount.get(d.accountId);
    if (list) list.push(d);
    else byAccount.set(d.accountId, [d]);
  }
  for (const list of byAccount.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const cursor = new Map<string, { i: number; balance: number }>(
    included.map((a) => [a.id, { i: 0, balance: a.openingBalance }]),
  );
  let unconverted = 0;
  const value: WorthPoint[] = [];
  for (const date of dates) {
    let sum = 0;
    let missing = 0;
    for (const a of included) {
      const state = cursor.get(a.id) as { i: number; balance: number };
      const list = byAccount.get(a.id) ?? [];
      while (state.i < list.length && (list[state.i] as DailyTotal).date <= date) {
        state.balance += (list[state.i] as DailyTotal).total;
        state.i += 1;
      }
      const converted = table.convert(money(state.balance, a.currency), to, date);
      if (converted) sum += converted.amount;
      else missing += 1;
    }
    unconverted = Math.max(unconverted, missing);
    value.push({ date, value: sum });
  }
  return { value, unconverted };
}

/* ----------------------------------------------------------------- category trend */

export interface TrendPoint {
  date: CalendarDate;
  /** Positive spending in the category (and its subcategories). */
  total: number;
}

/** Spending in a set of categories per bucket over the range. */
export function categoryTrend(
  entries: readonly ReportEntry[],
  table: RateTable,
  to: string,
  categoryIds: readonly string[],
  range: { from: CalendarDate; to: CalendarDate },
  bucket: Bucket = "month",
): Converted<TrendPoint[]> {
  const ids = new Set(categoryIds);
  const flow = incomeVsExpense(
    entries.filter((e) => e.kind === "expense" && e.categoryId !== null && ids.has(e.categoryId)),
    table,
    to,
    range,
    bucket,
  );
  return {
    value: flow.value.map((p) => ({ date: p.date, total: p.expense })),
    unconverted: flow.unconverted,
  };
}

/* ------------------------------------------------------------------ calendar heatmap */

export interface HeatDay {
  date: CalendarDate;
  /** Positive spending that day. */
  total: number;
  /** 0 = nothing spent, 1..4 = quartile of the busy days. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** Daily spending over the range with a 0..4 intensity level (quartiles of the days that have spending). */
export function calendarHeat(
  entries: readonly ReportEntry[],
  table: RateTable,
  to: string,
  range: { from: CalendarDate; to: CalendarDate },
): Converted<HeatDay[]> {
  const flow = incomeVsExpense(entries, table, to, range, "day");
  const spent = flow.value
    .map((p) => p.expense)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const q = (f: number) => spent[Math.min(spent.length - 1, Math.floor(spent.length * f))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const value = flow.value.map((p): HeatDay => {
    const total = Math.max(0, p.expense);
    const level = total === 0 ? 0 : total <= q1 ? 1 : total <= q2 ? 2 : total <= q3 ? 3 : 4;
    return { date: p.date, total, level };
  });
  return { value, unconverted: flow.unconverted };
}

/* --------------------------------------------------------------------- top payees */

export interface PayeeTotal {
  payee: string;
  total: number;
  count: number;
}

const payeeKey = (p: string) => p.trim().replace(/\s+/g, " ").toLowerCase();

/** The payees you spent most with (names compared case- and whitespace-insensitively). */
export function topPayees(
  entries: readonly ReportEntry[],
  table: RateTable,
  to: string,
  limit = 10,
): Converted<PayeeTotal[]> {
  const conv = converter(table, to);
  const map = new Map<string, PayeeTotal & { names: Map<string, number> }>();
  let unconverted = 0;
  for (const e of entries) {
    const key = payeeKey(e.payee);
    if (e.kind !== "expense" || key === "") continue;
    const amount = conv.at(e);
    if (amount === null) {
      unconverted += 1;
      continue;
    }
    const cur = map.get(key) ?? { payee: "", total: 0, count: 0, names: new Map() };
    cur.total -= amount;
    cur.count += 1;
    const name = e.payee.trim();
    cur.names.set(name, (cur.names.get(name) ?? 0) + 1);
    map.set(key, cur);
  }
  const value = [...map.values()]
    .filter((p) => p.total > 0)
    .map(({ names, ...p }) => ({
      ...p,
      // display the most frequent spelling
      payee:
        [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "",
    }))
    .sort((a, b) => b.total - a.total || a.payee.localeCompare(b.payee))
    .slice(0, limit);
  return { value, unconverted };
}

/* ------------------------------------------------------------------------ periods */

export type ReportPeriod = "month" | "last-month" | "3m" | "6m" | "12m" | "ytd";

export const REPORT_PERIODS: readonly { value: ReportPeriod; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "This year" },
];

/** Inclusive range of a report period relative to `today` (month periods end at the month's end, not today). */
export function reportRange(
  period: ReportPeriod,
  today: CalendarDate,
): { from: CalendarDate; to: CalendarDate } {
  switch (period) {
    case "month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const prev = addMonths(today, -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "3m":
      return { from: startOfMonth(addMonths(today, -2)), to: endOfMonth(today) };
    case "6m":
      return { from: startOfMonth(addMonths(today, -5)), to: endOfMonth(today) };
    case "12m":
      return { from: startOfMonth(addMonths(today, -11)), to: endOfMonth(today) };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  }
}

/** Bucket size that keeps a chart readable for the range length. */
export function bucketFor(range: { from: CalendarDate; to: CalendarDate }): Bucket {
  const days = diffDays(range.from, range.to) + 1;
  return days <= 35 ? "day" : days <= 120 ? "week" : "month";
}
