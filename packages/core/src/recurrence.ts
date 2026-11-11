import {
  addDays,
  addMonths,
  type CalendarDate,
  daysInMonth,
  diffDays,
  parseDate,
  weekday,
} from "./dates";

/**
 * Recurrence (PLAN §1.3). A deliberately small RRULE subset, enough for bills and subscriptions:
 * `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`, `INTERVAL`, `BYDAY` (weekly), `BYMONTHDAY` (monthly, -1 = last day), `UNTIL`.
 * `COUNT` is not supported (the rule row stores no start date to count from). Pure functions, no IO.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurrenceSpec {
  freq: Freq;
  interval: number;
  /** 0 = Monday ... 6 = Sunday; sorted, weekly only. */
  byDay: number[];
  /** 1..31, or -1 for the last day of the month; monthly only. */
  byMonthDay: number | null;
  until: CalendarDate | null;
}

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const FREQS: readonly string[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const MAX_INTERVAL = 1000;

function parseUntil(value: string): CalendarDate | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T\d{6}Z?)?$/.exec(value);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  try {
    parseDate(date);
    return date;
  } catch {
    return null;
  }
}

/** Parses the supported subset; null when the rule is malformed or uses anything unsupported (e.g. COUNT). */
export function parseRRule(rrule: string): RecurrenceSpec | null {
  const parts = new Map<string, string>();
  for (const piece of rrule.replace(/^RRULE:/i, "").split(";")) {
    if (piece === "") continue;
    const eq = piece.indexOf("=");
    if (eq <= 0) return null;
    const key = piece.slice(0, eq).toUpperCase();
    if (parts.has(key)) return null;
    parts.set(key, piece.slice(eq + 1).toUpperCase());
  }
  for (const key of parts.keys()) {
    if (!["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "UNTIL"].includes(key)) return null;
  }
  const freq = parts.get("FREQ");
  if (!freq || !FREQS.includes(freq)) return null;

  let interval = 1;
  const rawInterval = parts.get("INTERVAL");
  if (rawInterval !== undefined) {
    if (!/^\d+$/.test(rawInterval)) return null;
    interval = Number(rawInterval);
    if (interval < 1 || interval > MAX_INTERVAL) return null;
  }

  let byDay: number[] = [];
  const rawDay = parts.get("BYDAY");
  if (rawDay !== undefined) {
    if (freq !== "WEEKLY") return null;
    const days = rawDay.split(",").map((d) => DAY_CODES.indexOf(d as (typeof DAY_CODES)[number]));
    if (days.length === 0 || days.some((d) => d < 0)) return null;
    byDay = [...new Set(days)].sort((a, b) => a - b);
  }

  let byMonthDay: number | null = null;
  const rawMonthDay = parts.get("BYMONTHDAY");
  if (rawMonthDay !== undefined) {
    if (freq !== "MONTHLY" || !/^-?\d+$/.test(rawMonthDay)) return null;
    byMonthDay = Number(rawMonthDay);
    if (byMonthDay !== -1 && (byMonthDay < 1 || byMonthDay > 31)) return null;
  }

  let until: CalendarDate | null = null;
  const rawUntil = parts.get("UNTIL");
  if (rawUntil !== undefined) {
    until = parseUntil(rawUntil);
    if (!until) return null;
  }
  return { freq: freq as Freq, interval, byDay, byMonthDay, until };
}

export function isValidRRule(rrule: string): boolean {
  return parseRRule(rrule) !== null;
}

/** Canonical RRULE text for a spec (no `RRULE:` prefix, `UNTIL` as `YYYYMMDD`). */
export function buildRRule(spec: Partial<RecurrenceSpec> & { freq: Freq }): string {
  const out = [`FREQ=${spec.freq}`];
  if (spec.interval && spec.interval > 1) out.push(`INTERVAL=${spec.interval}`);
  if (spec.byDay && spec.byDay.length > 0) {
    out.push(
      `BYDAY=${[...spec.byDay]
        .sort((a, b) => a - b)
        .map((d) => DAY_CODES[d])
        .join(",")}`,
    );
  }
  if (spec.byMonthDay != null) out.push(`BYMONTHDAY=${spec.byMonthDay}`);
  if (spec.until) out.push(`UNTIL=${spec.until.replaceAll("-", "")}`);
  return out.join(";");
}

function monthlyOn(date: CalendarDate, months: number, byMonthDay: number | null): CalendarDate {
  const { day } = parseDate(date);
  const shifted = addMonths(`${date.slice(0, 8)}01`, months);
  const { year, month } = parseDate(shifted);
  const dim = daysInMonth(year, month);
  const wanted = byMonthDay === null ? day : byMonthDay === -1 ? dim : byMonthDay;
  return `${shifted.slice(0, 8)}${String(Math.min(wanted, dim)).padStart(2, "0")}`;
}

/**
 * The occurrence strictly after `current` (itself an occurrence, or the rule's anchor date); null once past
 * `UNTIL` or when the rule is invalid. Monthly rules without `BYMONTHDAY` keep `current`'s day, clamped to the
 * month length. Weekly rules with `BYDAY` visit the listed weekdays, then skip `INTERVAL - 1` weeks.
 */
export function nextOccurrence(rrule: string, current: CalendarDate): CalendarDate | null {
  const spec = parseRRule(rrule);
  if (!spec) return null;
  let next: CalendarDate;
  switch (spec.freq) {
    case "DAILY":
      next = addDays(current, spec.interval);
      break;
    case "WEEKLY": {
      if (spec.byDay.length === 0) {
        next = addDays(current, 7 * spec.interval);
        break;
      }
      const wd = weekday(current);
      const later = spec.byDay.find((d) => d > wd);
      if (later !== undefined) {
        next = addDays(current, later - wd);
      } else {
        const monday = addDays(current, -wd);
        next = addDays(monday, 7 * spec.interval + (spec.byDay[0] ?? 0));
      }
      break;
    }
    case "MONTHLY":
      next = monthlyOn(current, spec.interval, spec.byMonthDay);
      break;
    case "YEARLY":
      next = addMonths(current, 12 * spec.interval);
      break;
  }
  return spec.until !== null && next > spec.until ? null : next;
}

/** Hard cap so a very old `nextDate` with a daily rule cannot produce an unbounded list. */
const MAX_OCCURRENCES = 400;

/** Occurrences from `start` (inclusive, taken as the first one) up to `to` (inclusive). */
export function occurrencesBetween(
  rrule: string,
  start: CalendarDate,
  to: CalendarDate,
  limit = MAX_OCCURRENCES,
): CalendarDate[] {
  if (!isValidRRule(rrule)) return [];
  const out: CalendarDate[] = [];
  let cursor: CalendarDate | null = start;
  while (cursor !== null && cursor <= to && out.length < limit) {
    out.push(cursor);
    cursor = nextOccurrence(rrule, cursor);
  }
  return out;
}

/** First occurrence on or after `from`, starting the walk at `start`; null if the rule ends first. */
export function firstOccurrenceOnOrAfter(
  rrule: string,
  start: CalendarDate,
  from: CalendarDate,
): CalendarDate | null {
  let cursor: CalendarDate | null = start;
  for (let i = 0; cursor !== null && cursor < from; i++) {
    if (i >= 5000) return null;
    cursor = nextOccurrence(rrule, cursor);
  }
  return cursor;
}

export interface UpcomingItem<T> {
  rule: T;
  date: CalendarDate;
  /** Days from `today` (negative = overdue). */
  inDays: number;
}

export interface RuleLike {
  rrule: string;
  nextDate: CalendarDate;
  active: boolean;
}

/**
 * Upcoming bills: every occurrence of every active rule from its `nextDate` through `today + horizonDays`, soonest
 * first. Occurrences before `today` are overdue and still listed (they stay until posted or skipped).
 */
export function upcomingItems<T extends RuleLike>(
  rules: readonly T[],
  today: CalendarDate,
  horizonDays: number,
): UpcomingItem<T>[] {
  const to = addDays(today, horizonDays);
  const out: UpcomingItem<T>[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule.rrule, rule.nextDate, to)) {
      out.push({ rule, date, inDays: diffDays(today, date) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const ordinal = (n: number) => {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** Structured description of a supported rule, for UIs that translate it. */
export interface RRuleDescription {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** Weekdays, 0 = Monday … 6 = Sunday. */
  byDay: number[];
  /** Day of month, -1 = last day, null = unspecified. */
  byMonthDay: number | null;
  until: string | null;
}

/** Parts of the summary of an RRULE; null for rules outside the supported subset. */
export function describeRRuleParts(rrule: string): RRuleDescription | null {
  const spec = parseRRule(rrule);
  if (!spec) return null;
  return {
    freq: spec.freq,
    interval: spec.interval,
    byDay: [...spec.byDay],
    byMonthDay: spec.byMonthDay ?? null,
    until: spec.until ?? null,
  };
}

/** Plain-English summary ("Every 2 weeks on Friday"); null for rules outside the supported subset. */
export function describeRRule(rrule: string): string | null {
  const spec = describeRRuleParts(rrule);
  if (!spec) return null;
  const every = (unit: string, plural: string) =>
    spec.interval === 1 ? `Every ${unit}` : `Every ${spec.interval} ${plural}`;
  let text: string;
  switch (spec.freq) {
    case "DAILY":
      text = every("day", "days");
      break;
    case "WEEKLY":
      text = every("week", "weeks");
      if (spec.byDay.length > 0) text += ` on ${spec.byDay.map((d) => DAY_NAMES[d]).join(", ")}`;
      break;
    case "MONTHLY":
      text = every("month", "months");
      if (spec.byMonthDay === -1) text += " on the last day";
      else if (spec.byMonthDay !== null) text += ` on the ${ordinal(spec.byMonthDay)}`;
      break;
    case "YEARLY":
      text = every("year", "years");
      break;
  }
  return spec.until ? `${text} until ${spec.until}` : text;
}

export type RecurrencePreset =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "monthly_last"
  | "quarterly"
  | "yearly";

export const RECURRENCE_PRESETS: readonly { value: RecurrencePreset; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "monthly_last", label: "Monthly, last day" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Yearly" },
];

/** The RRULE a preset stands for, anchored on the first due date (weekday for weekly, day of month for monthly). */
export function rruleForPreset(preset: RecurrencePreset, anchor: CalendarDate): string {
  const day = Number(anchor.slice(8, 10));
  switch (preset) {
    case "weekly":
      return buildRRule({ freq: "WEEKLY", byDay: [weekday(anchor)] });
    case "biweekly":
      return buildRRule({ freq: "WEEKLY", interval: 2, byDay: [weekday(anchor)] });
    case "monthly":
      return buildRRule({ freq: "MONTHLY", byMonthDay: day });
    case "monthly_last":
      return buildRRule({ freq: "MONTHLY", byMonthDay: -1 });
    case "quarterly":
      return buildRRule({ freq: "MONTHLY", interval: 3, byMonthDay: day });
    case "yearly":
      return buildRRule({ freq: "YEARLY" });
  }
}

/** Which preset produces `rrule` for this anchor, or null for a custom rule. */
export function presetOf(rrule: string, anchor: CalendarDate): RecurrencePreset | null {
  const spec = parseRRule(rrule);
  if (!spec) return null;
  const canonical = buildRRule(spec);
  return (
    RECURRENCE_PRESETS.find((p) => rruleForPreset(p.value, anchor) === canonical)?.value ?? null
  );
}
