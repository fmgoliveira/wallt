import { parseAmount } from "@wallt/core";

export type AmountLocale = "pt" | "en" | "auto";

const strip = (v: string) => v.replace(/[\s  ]/g, "").replace(/[A-Za-z€$£¥]/g, "");

/**
 * Decide which separator is the decimal one for a column. `1.234,56` / `12,30` is `pt`, `1,234.56` / `12.30`
 * is `en`; when the column never shows a decimal part (whole numbers) the answer is `auto`.
 */
export function detectAmountLocale(values: readonly string[]): AmountLocale {
  let pt = 0;
  let en = 0;
  for (const raw of values) {
    const v = strip(raw).replace(/^[-+(]|[-)]$/g, "");
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(v)) pt++;
    else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$|^\d+\.\d{1,2}$/.test(v)) en++;
  }
  if (pt > en) return "pt";
  if (en > pt) return "en";
  return "auto";
}

/** Parse a cell to minor units, or null when empty / not an amount. */
export function parseCellAmount(
  value: string | undefined,
  currency: string,
  locale: AmountLocale,
): number | null {
  if (value === undefined || value.trim() === "") return null;
  try {
    return parseAmount(value, currency, locale);
  } catch {
    return null;
  }
}
