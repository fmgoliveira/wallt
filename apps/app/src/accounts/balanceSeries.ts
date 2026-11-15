const DAY_MS = 86_400_000;
const STEPS = 12;
const MAX_DAYS = 365;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Point {
  label: string;
  value: number;
}

/**
 * Running balance of one account at up to STEPS+1 evenly spaced dates, from its first activity (at most a year back)
 * to today. The balance at a date is the opening balance plus all activity up to and including that date.
 */
export function balanceSeries(
  openingBalance: number,
  activity: readonly { date: string; total: number }[],
  today: string,
  locale: string | undefined,
): Point[] {
  if (activity.length === 0) return [];
  const sorted = [...activity].sort((a, b) => a.date.localeCompare(b.date));
  const earliest = (sorted[0] as { date: string }).date;
  const floor = iso(utc(today) - MAX_DAYS * DAY_MS);
  const from = earliest > floor ? earliest : floor;
  const span = Math.max(1, Math.round((utc(today) - utc(from)) / DAY_MS));
  const dates = [
    ...new Set(
      Array.from({ length: STEPS + 1 }, (_, i) =>
        iso(utc(from) + Math.round((span * i) / STEPS) * DAY_MS),
      ),
    ),
  ];
  const long = span > 150;
  let i = 0;
  let balance = openingBalance;
  return dates.map((date) => {
    while (i < sorted.length && (sorted[i] as { date: string }).date <= date) {
      balance += (sorted[i] as { total: number }).total;
      i += 1;
    }
    const d = new Date(utc(date));
    const label = d.toLocaleDateString(
      locale,
      long
        ? { month: "short", timeZone: "UTC" }
        : { day: "numeric", month: "short", timeZone: "UTC" },
    );
    return { label, value: balance };
  });
}
