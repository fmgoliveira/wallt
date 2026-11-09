/**
 * Money utilities. Amounts are integers in minor units (e.g. cents) plus an ISO 4217 code.
 * No floating point is used anywhere in the arithmetic: scaling and rounding go through BigInt.
 * Sign convention: negative = outflow, positive = inflow.
 */

export type Money = { readonly amount: number; readonly currency: string };

export type NumberLocale = "pt" | "en";

const ZERO_EXPONENT = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const THREE_EXPONENT = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", BRL: "R$" };

export function assertCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`Invalid currency code: ${currency}`);
}

/** Number of minor-unit digits for an ISO 4217 currency (EUR 2, JPY 0, BHD 3). */
export function currencyExponent(currency: string): number {
  assertCurrency(currency);
  return ZERO_EXPONENT.has(currency) ? 0 : THREE_EXPONENT.has(currency) ? 3 : 2;
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount))
    throw new RangeError(`Amount must be a safe integer in minor units: ${amount}`);
}

export function money(amount: number, currency: string): Money {
  assertAmount(amount);
  assertCurrency(currency);
  return { amount, currency };
}

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency)
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(a: Money): Money {
  return money(a.amount === 0 ? 0 : -a.amount, a.currency);
}

export function sum(items: readonly Money[], currency: string): Money {
  return items.reduce(add, money(0, currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSame(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

/** Integer division of BigInts rounding half away from zero. `d` must be > 0. */
function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const q = (2n * abs + d) / (2n * d);
  return neg ? -q : q;
}

function toSafeNumber(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Amount out of safe integer range");
  }
  return Number(n);
}

/**
 * Split `total` (minor units) proportionally to integer `weights` using the largest-remainder method.
 * The parts always sum exactly to `total`; ties go to the earliest weight.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertAmount(total);
  if (weights.length === 0) throw new RangeError("allocate needs at least one weight");
  if (!weights.every((w) => Number.isSafeInteger(w) && w >= 0))
    throw new RangeError("Weights must be non-negative safe integers");
  const sumW = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (sumW === 0n) throw new RangeError("Weights must not all be zero");

  const sign = total < 0 ? -1n : 1n;
  const abs = BigInt(total) * sign;
  const parts = weights.map((w) => (abs * BigInt(w)) / sumW);
  const remainders = weights.map((w, i) => ({ i, r: (abs * BigInt(w)) % sumW }));
  let left = abs - parts.reduce((s, p) => s + p, 0n);
  remainders.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0n) break;
    parts[i] = (parts[i] as bigint) + 1n;
    left -= 1n;
  }
  return parts.map((p) => toSafeNumber(p * sign) + 0);
}

/** Split into `n` near-equal parts (remainder goes to the first parts). */
export function split(total: number, n: number): number[] {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  return allocate(total, new Array<number>(n).fill(1));
}

/**
 * Convert to another currency with a decimal-string rate (units of `to` per 1 unit of `from`),
 * e.g. "1.0837". Rounds half away from zero to the target's minor unit.
 */
export function convert(m: Money, to: string, rate: string): Money {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new RangeError(`Invalid FX rate: ${rate}`);
  const [whole = "0", frac = ""] = rate.split(".");
  const num = BigInt(whole + frac);
  if (num === 0n) throw new RangeError("FX rate must be positive");
  const scaleShift = currencyExponent(to) - currencyExponent(m.currency);
  let n = BigInt(m.amount) * num;
  let d = 10n ** BigInt(frac.length);
  if (scaleShift >= 0) n *= 10n ** BigInt(scaleShift);
  else d *= 10n ** BigInt(-scaleShift);
  return money(toSafeNumber(divRound(n, d)) + 0, to);
}

/**
 * Convert between two currencies through a common base (EUR): `fromPerBase` and `toPerBase` are decimal-string
 * rates, units of each currency per 1 base unit. Same rounding as `convert`; one division, so no double rounding.
 */
export function convertCross(m: Money, to: string, fromPerBase: string, toPerBase: string): Money {
  const parse = (rate: string) => {
    if (!/^\d+(\.\d+)?$/.test(rate)) throw new RangeError(`Invalid FX rate: ${rate}`);
    const [whole = "0", frac = ""] = rate.split(".");
    const num = BigInt(whole + frac);
    if (num === 0n) throw new RangeError("FX rate must be positive");
    return { num, scale: 10n ** BigInt(frac.length) };
  };
  const f = parse(fromPerBase);
  const t = parse(toPerBase);
  const n = BigInt(m.amount) * t.num * f.scale * 10n ** BigInt(currencyExponent(to));
  const d = f.num * t.scale * 10n ** BigInt(currencyExponent(m.currency));
  return money(toSafeNumber(divRound(n, d)) + 0, to);
}

/**
 * Parse a user/bank amount string into minor units. Handles `1.234,56`, `1,234.56`, `-12,30`,
 * `12,30-`, `(12,30)`, currency symbols and spaces. Pass `locale` to resolve ambiguous input
 * like `1.234`; with `auto` a lone separator followed by exactly 3 digits is a thousands separator
 * (unless the currency has 3 decimals). More fractional digits than the currency allows is an error.
 */
export function parseAmount(
  input: string,
  currency: string,
  locale: NumberLocale | "auto" = "auto",
): number {
  const exp = currencyExponent(currency);
  let s = input.replace(/[\s  ]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/[A-Za-z€$£¥]/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) throw new RangeError(`Cannot parse amount: ${input}`);

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalSep: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const count = s.split(sep).length - 1;
    const tail = s.length - s.lastIndexOf(sep) - 1;
    if (count > 1) decimalSep = null;
    else if (locale === "pt") decimalSep = sep === "," ? "," : null;
    else if (locale === "en") decimalSep = sep === "." ? "." : null;
    else decimalSep = tail === 3 && exp !== 3 ? null : sep;
    if (decimalSep === null && count > 1 && tail !== 3)
      throw new RangeError(`Cannot parse amount: ${input}`);
  }

  let intPart = s;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "") || "0";
  if (fracPart.length > exp) {
    if (/[^0]/.test(fracPart.slice(exp)))
      throw new RangeError(`Too many decimals for ${currency}: ${input}`);
    fracPart = fracPart.slice(0, exp);
  }
  const minor = BigInt(intPart + fracPart.padEnd(exp, "0"));
  return toSafeNumber(negative ? -minor : minor) + 0;
}

/** Format minor units for display, e.g. pt: `1 234,56 €`, en: `€1,234.56`. */
export function formatAmount(m: Money, locale: NumberLocale = "pt"): string {
  const exp = currencyExponent(m.currency);
  const abs = BigInt(Math.abs(m.amount));
  const digits = abs.toString().padStart(exp + 1, "0");
  const intDigits = digits.slice(0, digits.length - exp);
  const frac = exp > 0 ? digits.slice(-exp) : "";
  const group = locale === "pt" ? " " : ",";
  const dec = locale === "pt" ? "," : ".";
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const num = frac ? `${grouped}${dec}${frac}` : grouped;
  const sym = SYMBOLS[m.currency] ?? m.currency;
  const sign = m.amount < 0 ? "-" : "";
  return locale === "pt"
    ? `${sign}${num} ${sym}`
    : `${sign}${SYMBOLS[m.currency] ? sym : `${sym} `}${num}`;
}
