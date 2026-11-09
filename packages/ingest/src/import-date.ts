import { addDays, type CalendarDate, isValidDate } from "@wallt/core";

/** How a column writes dates: a day/month/year order, or Excel serial numbers. */
export type DateFormat = { kind: "pattern"; order: "dmy" | "mdy" | "ymd" } | { kind: "serial" };

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function build(y: number, m: number, d: number): CalendarDate | null {
  const year = y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const s = `${pad(year, 4)}-${pad(m)}-${pad(d)}`;
  return isValidDate(s) ? s : null;
}

/** Parse one date cell with a known order. Ignores a trailing time (`2024-02-03 10:11`, `...T10:11:00Z`). */
export function parseWithOrder(value: string, order: "dmy" | "mdy" | "ymd"): CalendarDate | null {
  const head = value.trim().split(/[ T]/)[0] ?? "";
  let parts: string[];
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(head);
  if (compact) parts = [compact[1] as string, compact[2] as string, compact[3] as string];
  else {
    const m = /^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})$/.exec(head);
    if (!m) return null;
    parts = [m[1] as string, m[3] as string, m[4] as string];
  }
  const [a, b, c] = parts.map(Number) as [number, number, number];
  if (order === "ymd") return (parts[0] as string).length === 4 ? build(a, b, c) : null;
  // day-first / month-first need the year last
  if ((parts[2] as string).length === 3 || (parts[0] as string).length === 4) return null;
  return order === "dmy" ? build(c, b, a) : build(c, a, b);
}

/** Excel serial (1900 system, with the 1900 leap-year quirk folded into the epoch) to a calendar date. */
export function fromExcelSerial(serial: number): CalendarDate | null {
  if (!Number.isFinite(serial) || serial < 25569 || serial > 80000) return null; // 1970..2118
  return addDays("1899-12-30", Math.floor(serial));
}

export function parseImportDate(value: string, format: DateFormat): CalendarDate | null {
  const v = value.trim();
  if (v === "") return null;
  if (format.kind === "serial") {
    return /^\d+([.,]\d+)?$/.test(v) ? fromExcelSerial(Number(v.replace(",", "."))) : null;
  }
  return parseWithOrder(v, format.order);
}

/** True if the text looks like a date in some supported pattern. */
export function looksLikeDate(value: string): boolean {
  return (["ymd", "dmy", "mdy"] as const).some((o) => parseWithOrder(value, o) !== null);
}

/**
 * Pick the format that parses every value. Day-first wins over month-first when both fit (Portuguese banks),
 * and a year-first pattern only matches 4-digit years. Returns null when no format parses at least `minShare`
 * of the non-empty values.
 */
export function detectDateFormat(values: readonly string[], minShare = 0.9): DateFormat | null {
  const filled = values.map((v) => v.trim()).filter((v) => v !== "");
  if (filled.length === 0) return null;
  let best: { format: DateFormat; ok: number } | null = null;
  for (const order of ["ymd", "dmy", "mdy"] as const) {
    const ok = filled.filter((v) => parseWithOrder(v, order) !== null).length;
    if (ok === filled.length) return { kind: "pattern", order };
    if (!best || ok > best.ok) best = { format: { kind: "pattern", order }, ok };
  }
  const serialOk = filled.filter((v) => parseImportDate(v, { kind: "serial" }) !== null).length;
  if (serialOk === filled.length) return { kind: "serial" };
  if (best && best.ok / filled.length >= minShare) return best.format;
  return null;
}
