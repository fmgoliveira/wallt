import { convertCross, type Money, money } from "./money";

/**
 * FX conversion (PLAN §1.3). Rates are the ECB's daily reference rates: units of `quote` per 1 EUR, as decimal
 * strings, so no float is ever involved (see `convertCross`). A conversion uses the rate of the transaction's date;
 * when that day has none (weekend, holiday, not fetched yet) it falls back to the last known earlier rate, and to
 * the earliest known one for dates before the history starts. Pure, no IO.
 */

export const BASE_CURRENCY = "EUR";

export interface FxRow {
  date: string;
  base: string;
  quote: string;
  rate: string;
}

export interface RateTable {
  /** Units of `currency` per 1 EUR on `date` (with fallback); null when the currency has no rates at all. */
  perBase(currency: string, date: string): { rate: string; date: string } | null;
  /** Newest date with any rate; null when empty. */
  latestDate(): string | null;
  /** Whether a conversion between the two currencies is possible. */
  canConvert(from: string, to: string): boolean;
  /** `m` in `to` at the rate of `date`; null when a currency has no rates. Same currency returns `m` unchanged. */
  convert(m: Money, to: string, date: string): Money | null;
}

export function createRateTable(rows: readonly FxRow[]): RateTable {
  const byQuote = new Map<string, { date: string; rate: string }[]>();
  let latest: string | null = null;
  for (const r of rows) {
    if (r.base !== BASE_CURRENCY) continue;
    const list = byQuote.get(r.quote);
    if (list) list.push({ date: r.date, rate: r.rate });
    else byQuote.set(r.quote, [{ date: r.date, rate: r.rate }]);
    if (latest === null || r.date > latest) latest = r.date;
  }
  for (const list of byQuote.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const perBase: RateTable["perBase"] = (currency, date) => {
    if (currency === BASE_CURRENCY) return { rate: "1", date };
    const list = byQuote.get(currency);
    if (!list || list.length === 0) return null;
    // last entry on or before `date`, else the earliest known
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid] as { date: string }).date <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return list[Math.max(found, 0)] ?? null;
  };

  return {
    perBase,
    latestDate: () => latest,
    canConvert: (from, to) =>
      from === to || (perBase(from, "9999-12-31") !== null && perBase(to, "9999-12-31") !== null),
    convert(m, to, date) {
      if (m.currency === to) return m;
      const from = perBase(m.currency, date);
      const target = perBase(to, date);
      if (!from || !target) return null;
      return convertCross(m, to, from.rate, target.rate);
    },
  };
}

/** Sum of amounts in `to`, each converted at its own date; items that cannot be converted are counted apart. */
export function sumConverted(
  table: RateTable,
  items: readonly { amount: number; currency: string; date: string }[],
  to: string,
): { total: number; unconverted: number } {
  let total = 0;
  let unconverted = 0;
  for (const item of items) {
    const converted = table.convert(money(item.amount, item.currency), to, item.date);
    if (converted) total += converted.amount;
    else unconverted += 1;
  }
  return { total, unconverted };
}
