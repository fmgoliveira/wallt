import { type CalendarDate, daysInMonth, diffDays, weekday } from "./dates";
import { buildRRule, firstOccurrenceOnOrAfter, nextOccurrence } from "./recurrence";

/**
 * Finds recurring charges in transaction history (PLAN §1.3): same payee and account, similar amount, regular
 * interval. It only ever *suggests*; creating a rule is always the user's confirmed action. Pure, no IO.
 */

export interface HistoryItem {
  date: CalendarDate;
  /** Signed minor units. */
  amount: number;
  currency: string;
  payee: string;
  accountId: string;
  categoryId: string | null;
  kind: "expense" | "income" | "transfer";
}

export interface RecurringSuggestion {
  /** Stable id for dismissing a suggestion: payee, account, currency and sign. */
  key: string;
  payee: string;
  /** Median amount of the occurrences (signed). */
  amount: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
  rrule: string;
  nextDate: CalendarDate;
  occurrences: number;
  lastDate: CalendarDate;
  /** 0..100: how regular the dates and amounts are. */
  confidence: number;
}

interface Cadence {
  min: number;
  max: number;
  /** Nominal days between occurrences. */
  period: number;
  freq: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
}

const CADENCES: readonly Cadence[] = [
  { min: 6, max: 8, period: 7, freq: "WEEKLY", interval: 1 },
  { min: 13, max: 15, period: 14, freq: "WEEKLY", interval: 2 },
  { min: 27, max: 34, period: 30, freq: "MONTHLY", interval: 1 },
  { min: 86, max: 95, period: 91, freq: "MONTHLY", interval: 3 },
  { min: 360, max: 370, period: 365, freq: "YEARLY", interval: 1 },
];

export const MIN_OCCURRENCES = 3;
/** Share of gaps and of amounts that must fit the pattern. */
const MIN_FIT_PERCENT = 75;
/** Amounts within this percent of the median count as "similar". */
const AMOUNT_TOLERANCE_PERCENT = 15;

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
};

export const normalizePayee = (payee: string) => payee.trim().replace(/\s+/g, " ").toLowerCase();

export function suggestionKey(
  item: Pick<HistoryItem, "payee" | "accountId" | "currency" | "amount">,
) {
  return `${normalizePayee(item.payee)}|${item.accountId}|${item.currency}|${item.amount < 0 ? "-" : "+"}`;
}

export function detectRecurring(
  history: readonly HistoryItem[],
  today: CalendarDate,
  /** Payee + account of rules that already exist: never suggested again. */
  existing: readonly { payee: string; accountId: string }[] = [],
): RecurringSuggestion[] {
  const known = new Set(existing.map((r) => `${normalizePayee(r.payee)}|${r.accountId}`));
  const groups = new Map<string, HistoryItem[]>();
  for (const item of history) {
    if (item.kind === "transfer" || item.amount === 0 || normalizePayee(item.payee) === "")
      continue;
    if (known.has(`${normalizePayee(item.payee)}|${item.accountId}`)) continue;
    const key = suggestionKey(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, items] of groups) {
    if (items.length < MIN_OCCURRENCES) continue;
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((it, i) => diffDays((sorted[i] as HistoryItem).date, it.date));
    const typical = median(gaps);
    const cadence = CADENCES.find((c) => typical >= c.min && typical <= c.max);
    if (!cadence) continue;
    const gapsOk = gaps.filter((g) => g >= cadence.min && g <= cadence.max).length;
    const medianAmount = median(sorted.map((s) => s.amount));
    const amountsOk = sorted.filter(
      (s) =>
        Math.abs(s.amount - medianAmount) * 100 <=
        AMOUNT_TOLERANCE_PERCENT * Math.abs(medianAmount),
    ).length;
    const gapPercent = (gapsOk * 100) / gaps.length;
    const amountPercent = (amountsOk * 100) / sorted.length;
    if (gapPercent < MIN_FIT_PERCENT || amountPercent < MIN_FIT_PERCENT) continue;

    const last = sorted[sorted.length - 1] as HistoryItem;
    // A subscription nobody paid for two cycles has probably been cancelled.
    if (diffDays(last.date, today) > 2 * cadence.period) continue;

    const day = Number(last.date.slice(8, 10));
    const [y, m] = [Number(last.date.slice(0, 4)), Number(last.date.slice(5, 7))];
    const lastOfMonth = daysInMonth(y, m) === day;
    const rrule = buildRRule({
      freq: cadence.freq,
      interval: cadence.interval,
      byDay: cadence.freq === "WEEKLY" ? [weekday(last.date)] : [],
      byMonthDay: cadence.freq === "MONTHLY" ? (day >= 28 && lastOfMonth ? -1 : day) : null,
    });
    const first = nextOccurrence(rrule, last.date);
    const nextDate = first && firstOccurrenceOnOrAfter(rrule, first, today);
    if (!nextDate) continue;

    out.push({
      key,
      payee: last.payee.trim(),
      amount: medianAmount,
      currency: last.currency,
      accountId: last.accountId,
      categoryId: [...sorted].reverse().find((s) => s.categoryId)?.categoryId ?? null,
      rrule,
      nextDate,
      occurrences: sorted.length,
      lastDate: last.date,
      confidence: Math.floor((gapPercent + amountPercent) / 2),
    });
  }
  return out.sort(
    (a, b) =>
      b.confidence - a.confidence || b.occurrences - a.occurrences || a.key.localeCompare(b.key),
  );
}
