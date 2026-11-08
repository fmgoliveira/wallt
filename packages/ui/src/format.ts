import { currencyExponent, formatAmount, type NumberLocale } from "@wallt/core";

export interface AmountParts {
  /** `−` (U+2212) for outflows, `+` when `showPlus` and inflow, otherwise empty. */
  sign: "" | "−" | "+";
  /** Integer digits with grouping, e.g. `1 234` / `1,234`. */
  integer: string;
  /** Decimal mark + fraction (`,56` / `.56`), empty for zero-exponent currencies. */
  decimals: string;
  /** Currency symbol (or code). */
  symbol: string;
  /** Symbol comes before the number (en) or after it (pt). */
  symbolFirst: boolean;
}

/**
 * Split a minor-unit amount into styled parts. Formatting itself is `@wallt/core`'s `formatAmount`
 * (BigInt, no floats); this only slices its output so the UI can dim the decimals.
 */
export function amountParts(
  minor: number,
  currency: string,
  locale: NumberLocale = "pt",
  showPlus = false,
): AmountParts {
  const text = formatAmount({ amount: Math.abs(minor), currency }, locale);
  const exp = currencyExponent(currency);
  const sign = minor < 0 ? "−" : showPlus && minor > 0 ? "+" : "";
  const dec = locale === "pt" ? "," : ".";

  const m =
    locale === "pt"
      ? /^(?<num>[\d\s  ]+(?:,\d+)?)[\s  ]+(?<sym>.+)$/.exec(text)
      : /^(?<sym>\D*?)(?<num>[\d,]+(?:\.\d+)?)$/.exec(text);
  const num = m?.groups?.num ?? text;
  const symbol = (m?.groups?.sym ?? "").trim();

  const cut = exp > 0 ? num.lastIndexOf(dec) : -1;
  return {
    sign,
    integer: cut >= 0 ? num.slice(0, cut) : num,
    decimals: cut >= 0 ? num.slice(cut) : "",
    symbol,
    symbolFirst: locale !== "pt",
  };
}
