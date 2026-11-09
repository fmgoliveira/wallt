/**
 * Calendar-date helpers. A calendar date is a `YYYY-MM-DD` string with no timezone.
 * Timestamps are UTC ISO strings. All arithmetic uses UTC so results never depend on the host TZ.
 */

export type CalendarDate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtc(y: number, m: number, d: number): number {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime();
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

export function parseDate(value: string): { year: number; month: number; day: number } {
  const m = RE.exec(value);
  if (!m) throw new RangeError(`Invalid calendar date: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(toUtc(year, month, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

export function isValidDate(value: string): boolean {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

function fromMs(ms: number): CalendarDate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function ms(value: CalendarDate): number {
  const { year, month, day } = parseDate(value);
  return toUtc(year, month, day);
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  return fromMs(ms(value) + days * DAY_MS);
}

/** Add months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: CalendarDate, months: number): CalendarDate {
  const { year, month, day } = parseDate(value);
  const idx = year * 12 + (month - 1) + months;
  const y = Math.floor(idx / 12);
  const m = (((idx % 12) + 12) % 12) + 1;
  return `${pad(y, 4)}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(toUtc(year, month + 1, 0)).getUTCDate();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: CalendarDate, b: CalendarDate): number {
  return Math.round((ms(b) - ms(a)) / DAY_MS);
}

/** Day of week of a calendar date: 0 = Monday ... 6 = Sunday (ISO). */
export function weekday(value: CalendarDate): number {
  return (((Math.floor(ms(value) / DAY_MS) + 3) % 7) + 7) % 7;
}

export function startOfMonth(value: CalendarDate): CalendarDate {
  const { year, month } = parseDate(value);
  return `${pad(year, 4)}-${pad(month)}-01`;
}

export function endOfMonth(value: CalendarDate): CalendarDate {
  const { year, month } = parseDate(value);
  return `${pad(year, 4)}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/** Lexicographic order equals chronological order for valid `YYYY-MM-DD` strings. */
export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Calendar date of a Date in the given UTC offset-free sense: uses the Date's local fields. */
export function fromLocalDate(d: Date): CalendarDate {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toUtcTimestamp(d: Date): string {
  return d.toISOString();
}
