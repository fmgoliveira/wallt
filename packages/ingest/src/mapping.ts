import type { CalendarDate } from "@wallt/core";
import { type AmountLocale, detectAmountLocale, parseCellAmount } from "./amount";
import { type ColumnRole, findHeaderRow, headerRole, normalizeHeader } from "./header";
import { type DateFormat, detectDateFormat, looksLikeDate, parseImportDate } from "./import-date";
import type { Rows } from "./tabularize";

/** Column indexes by role. Serializable: this is the core of an import profile's config (PLAN 5.2). */
export type ColumnMap = Partial<Record<ColumnRole, number>>;

export interface ImportMapping {
  /** Row index of the header, or null when the first row is already data. */
  headerRow: number | null;
  columns: ColumnMap;
  dateFormat: DateFormat;
  amountLocale: AmountLocale;
  /** Flip the sign of a single signed amount column (validated against the balance column when present). */
  invertSign: boolean;
}

export interface BalanceCheck {
  /** Share of consecutive row pairs where the balance moved by exactly the amount (0..1). */
  matchRatio: number;
  /** File is listed newest-first. */
  descending: boolean;
  /** The amounts only reconcile with the balance after flipping their sign. */
  flipped: boolean;
  pairs: number;
}

export interface InferenceResult {
  mapping: ImportMapping;
  /** 0..1, from what was found (date + amount + description) and how consistent the data is. */
  confidence: number;
  balanceCheck: BalanceCheck | null;
  notes: string[];
}

export interface ParsedRow {
  /** Index into the source rows. */
  rowIndex: number;
  bookingDate: CalendarDate;
  valueDate: CalendarDate | null;
  /** Integer minor units, negative = outflow. */
  amount: number;
  currency: string;
  description: string;
  payee: string | null;
  reference: string | null;
  category: string | null;
  balance: number | null;
  /** The bank's own transaction id (OFX FITID, CAMT reference); null for file imports without one. */
  externalId: string | null;
}

export interface ParseError {
  rowIndex: number;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
  /** Blank, preamble/footer and total lines that carry no transaction. */
  skipped: number;
}

const SAMPLE = 200;
/** A header that names a number column lowers the bar: a few unreadable rows must not hide the column. */
const NUMERIC_ROLES = new Set<ColumnRole>(["amount", "debit", "credit", "balance"]);
const cell = (row: string[] | undefined, i: number | undefined) =>
  i === undefined ? "" : (row?.[i] ?? "");

type ColType = "date" | "number" | "text" | "empty";

interface ColumnStats {
  index: number;
  role: ColumnRole | null;
  filled: number;
  avgLength: number;
  type: ColType;
}

function analyse(data: Rows, headers: string[], width: number, currency: string): ColumnStats[] {
  const sample = data.slice(0, SAMPLE);
  const out: ColumnStats[] = [];
  for (let c = 0; c < width; c++) {
    const values = sample.map((r) => cell(r, c)).filter((v) => v !== "");
    const filled = values.length;
    const header = headers[c] ?? "";
    const role = header ? headerRole(header) : null;
    const dates = values.filter((v) => looksLikeDate(v)).length;
    const serialLike =
      role === "date" || role === "valueDate"
        ? values.filter((v) => detectDateFormat([v])?.kind === "serial").length
        : 0;
    const nums = values.filter((v) => parseCellAmount(v, currency, "auto") !== null).length;
    const dateRatio = filled ? Math.max(dates, serialLike) / filled : 0;
    const numberRatio = filled ? nums / filled : 0;
    const avgLength = filled ? values.reduce((n, v) => n + v.length, 0) / filled : 0;
    let type: ColType = "text";
    if (filled === 0) type = "empty";
    else if (dateRatio >= (role === "date" || role === "valueDate" ? 0.5 : 0.8)) type = "date";
    else if (numberRatio >= (role && NUMERIC_ROLES.has(role) ? 0.5 : 0.8)) type = "number";
    out.push({ index: c, role, filled, avgLength, type });
  }
  return out;
}

/** Walk the rows chronologically and test `balance[i] = balance[i-1] + amount[i]` (reverse for newest-first). */
export function checkBalance(
  amounts: readonly (number | null)[],
  balances: readonly (number | null)[],
): BalanceCheck {
  const score = (descending: boolean, sign: 1 | -1) => {
    let ok = 0;
    let pairs = 0;
    for (let i = 1; i < amounts.length; i++) {
      const prev = descending ? balances[i] : balances[i - 1];
      const cur = descending ? balances[i - 1] : balances[i];
      const amt = descending ? amounts[i - 1] : amounts[i];
      if (prev == null || cur == null || amt == null) continue;
      pairs++;
      if (prev + sign * amt === cur) ok++;
    }
    return { ratio: pairs ? ok / pairs : 0, pairs };
  };
  let best: BalanceCheck = { matchRatio: 0, descending: false, flipped: false, pairs: 0 };
  for (const descending of [false, true]) {
    for (const sign of [1, -1] as const) {
      const s = score(descending, sign);
      if (s.ratio > best.matchRatio) {
        best = { matchRatio: s.ratio, descending, flipped: sign === -1, pairs: s.pairs };
      }
    }
  }
  return best;
}

/**
 * Infer a mapping for a tabularized file: header row, column roles (header keywords first, value patterns
 * second), date format, decimal separator, debit/credit split and sign (validated against a balance column).
 */
export function inferMapping(rows: Rows, currency = "EUR"): InferenceResult {
  const notes: string[] = [];
  const headerRow = findHeaderRow(rows);
  const data = rows.slice(headerRow === null ? 0 : headerRow + 1);
  const headers = headerRow === null ? [] : (rows[headerRow] ?? []);
  const width = Math.max(headers.length, ...data.slice(0, SAMPLE).map((r) => r.length), 0);
  const stats = analyse(data, headers, width, currency);
  const columns: ColumnMap = {};
  const used = new Set<number>();
  const take = (role: ColumnRole, index: number | undefined) => {
    if (index === undefined || used.has(index) || columns[role] !== undefined) return;
    columns[role] = index;
    used.add(index);
  };

  // 1. dates: header keyword first, else the left-most date-looking columns
  const dateCols = stats.filter((s) => s.type === "date");
  take("valueDate", dateCols.find((s) => s.role === "valueDate")?.index);
  take("date", dateCols.find((s) => s.role === "date")?.index);
  const freeDates = () => dateCols.filter((s) => !used.has(s.index));
  take("date", freeDates()[0]?.index);
  take("valueDate", freeDates()[0]?.index);
  if (columns.date === undefined) notes.push("No date column found");

  // 2. numbers
  const numeric = stats.filter((s) => s.type === "number" && !used.has(s.index));
  for (const role of ["amount", "debit", "credit", "balance"] as const)
    take(role, numeric.find((s) => s.role === role)?.index);
  const loose = numeric.filter((s) => !used.has(s.index));
  const sparse = (s: ColumnStats) => s.filled < Math.min(data.length, SAMPLE) * 0.9;
  if (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined) {
    const [a, b, c] = loose;
    if (a && b && sparse(a) && sparse(b)) {
      take("debit", a.index);
      take("credit", b.index);
      take("balance", c?.index);
    } else {
      take("amount", a?.index);
      take("balance", b?.index);
    }
  } else if (columns.balance === undefined) {
    take("balance", loose[0]?.index);
  }

  // 3. text roles: header keywords, then the longest free text column is the description
  const text = stats.filter(
    (s) => (s.type === "text" || s.type === "number") && !used.has(s.index),
  );
  for (const role of ["description", "payee", "reference", "category", "currency"] as const)
    take(role, text.find((s) => s.role === role && !used.has(s.index))?.index);
  if (columns.description === undefined) {
    const longest = stats
      .filter((s) => s.type === "text" && !used.has(s.index) && s.filled > 0)
      .sort((x, y) => y.avgLength - x.avgLength)[0];
    take("description", longest?.index);
  }
  if (columns.description === undefined) notes.push("No description column found");

  // 4. formats
  const dateFormat: DateFormat = detectDateFormat(
    data.slice(0, SAMPLE).map((r) => cell(r, columns.date)),
  ) ?? { kind: "pattern", order: "dmy" };
  const amountValues = [columns.amount, columns.debit, columns.credit, columns.balance]
    .filter((i): i is number => i !== undefined)
    .flatMap((i) => data.slice(0, SAMPLE).map((r) => cell(r, i)));
  const amountLocale = detectAmountLocale(amountValues);
  const mapping: ImportMapping = {
    headerRow,
    columns,
    dateFormat,
    amountLocale,
    invertSign: false,
  };

  // 5. sign from the balance column
  let balanceCheck: BalanceCheck | null = null;
  if (columns.balance !== undefined && columns.date !== undefined) {
    const probe = parseRows(rows, mapping, currency);
    if (probe.rows.length > 1) {
      balanceCheck = checkBalance(
        probe.rows.map((r) => r.amount),
        probe.rows.map((r) => r.balance),
      );
      if (balanceCheck.matchRatio >= 0.8) {
        if (balanceCheck.flipped && columns.amount !== undefined) {
          mapping.invertSign = true;
          notes.push("Amounts reconcile with the balance only after flipping their sign");
        }
      } else if (balanceCheck.pairs > 0) {
        notes.push("The balance column does not reconcile with the amounts");
      }
    }
  }

  const haveAmount =
    columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
  if (!haveAmount) notes.push("No amount column found");
  const parsed = parseRows(rows, mapping, currency);
  const total = parsed.rows.length + parsed.errors.length;
  const cleanShare = total ? parsed.rows.length / total : 0;
  const confidence = Math.min(
    1,
    Math.round(
      ((columns.date !== undefined ? 0.3 : 0) +
        (haveAmount ? 0.3 : 0) +
        (columns.description !== undefined ? 0.1 : 0) +
        cleanShare * 0.2 +
        (headerRow !== null ? 0.05 : 0) +
        (balanceCheck && balanceCheck.matchRatio >= 0.8 ? 0.05 : 0)) *
        100,
    ) / 100,
  );
  return { mapping, confidence, balanceCheck, notes };
}

/** Apply a mapping to the rows. Rows without a date are skipped; half-parsed rows are reported as errors. */
export function parseRows(rows: Rows, mapping: ImportMapping, currency = "EUR"): ParseResult {
  const out: ParsedRow[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;
  const c = mapping.columns;
  const start = mapping.headerRow === null ? 0 : mapping.headerRow + 1;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] as string[];
    if (row.every((v) => v === "")) {
      skipped++;
      continue;
    }
    const dateText = cell(row, c.date);
    const bookingDate = parseImportDate(dateText, mapping.dateFormat);
    let amount: number | null = null;
    if (c.amount !== undefined) {
      amount = parseCellAmount(cell(row, c.amount), currency, mapping.amountLocale);
      if (amount !== null && mapping.invertSign) amount = -amount;
    } else if (c.debit !== undefined || c.credit !== undefined) {
      const debit = parseCellAmount(cell(row, c.debit), currency, mapping.amountLocale);
      const credit = parseCellAmount(cell(row, c.credit), currency, mapping.amountLocale);
      if (debit !== null || credit !== null) amount = Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (bookingDate === null) {
      // preamble, totals and footers carry no date: skipped, unless a date-ish cell came with an amount
      if (amount !== null && dateText !== "")
        errors.push({ rowIndex: i, reason: `Unreadable date "${dateText}"` });
      else skipped++;
      continue;
    }
    if (amount === null) {
      errors.push({ rowIndex: i, reason: "Unreadable amount" });
      continue;
    }
    const valueText = cell(row, c.valueDate);
    out.push({
      rowIndex: i,
      bookingDate,
      valueDate: valueText ? parseImportDate(valueText, mapping.dateFormat) : null,
      amount,
      currency,
      description: cell(row, c.description),
      payee: cell(row, c.payee) || null,
      reference: cell(row, c.reference) || null,
      category: cell(row, c.category) || null,
      balance: parseCellAmount(cell(row, c.balance), currency, mapping.amountLocale),
      externalId: null,
    });
  }
  return { rows: out, errors, skipped };
}

/**
 * Stable identity of a file layout for matching saved profiles (PLAN 5.1 step 6): normalized header names,
 * column count and delimiter. Same layout, same fingerprint, regardless of the data below.
 */
export function fingerprint(
  headers: readonly string[],
  columnCount: number,
  delimiter = "",
): string {
  const text = `${headers.map(normalizeHeader).join("|")}#${columnCount}#${delimiter === "\t" ? "tab" : delimiter}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
