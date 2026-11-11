import type { Db } from "../database";
import type { Logger } from "../logger";
import type { createScheduler } from "../scheduler";

/** The European Central Bank's euro foreign exchange reference rates (published around 16:00 CET on TARGET days). */
export const ECB_URLS = {
  daily: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  last90Days: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
  history: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml",
} as const;

/** Weekdays 16:30 in the server's TZ (late enough for Western and Central Europe), after the ECB has published. */
export const FX_SCHEDULE = "30 16 * * 1-5";
export const FX_JOB = "fx-rates";

export interface FxRate {
  date: string;
  base: "EUR";
  quote: string;
  rate: string;
}

export type FetchText = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Reads the ECB XML: `<Cube time="2026-11-06"><Cube currency="USD" rate="1.0837"/>...</Cube>`. Rates are kept as
 * the decimal strings the ECB published. Anything that is not a plausible date, currency code or positive decimal
 * is dropped instead of stored.
 */
export function parseEcbXml(xml: string): FxRate[] {
  const out: FxRate[] = [];
  const day = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  const cell = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9]+(?:\.[0-9]+)?)['"]\s*\/?>/g;
  for (const d of xml.matchAll(day)) {
    const date = d[1] as string;
    for (const c of (d[2] as string).matchAll(cell)) {
      const rate = c[2] as string;
      if (Number(rate) > 0) out.push({ date, base: "EUR", quote: c[1] as string, rate });
    }
  }
  return out;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: Date) =>
  Math.floor((to.getTime() - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export function createFxService(opts: {
  db: Db;
  log: Logger;
  fetch: FetchText;
  /** Clock (ms); tests inject one. */
  clock?: () => number;
}) {
  const { db, log, fetch } = opts;
  const now = opts.clock ?? Date.now;

  const upsert = db.prepare(
    "INSERT INTO fx_rates (date, base, quote, rate) VALUES (?, ?, ?, ?) ON CONFLICT(date, base, quote) DO UPDATE SET rate = excluded.rate",
  );
  const latest = db.prepare("SELECT max(date) AS date FROM fx_rates");

  const latestDate = (): string | null => (latest.get() as { date: string | null }).date;

  /** The smallest ECB file that closes the gap since the newest rate we hold. */
  function sourceFor(): keyof typeof ECB_URLS {
    const last = latestDate();
    if (!last) return "history";
    const gap = daysBetween(last, new Date(now()));
    return gap > 85 ? "history" : gap > 1 ? "last90Days" : "daily";
  }

  const service = {
    latestDate,

    /** Downloads and stores rates; throws on network/HTTP errors so the scheduler records a failed run. */
    async refresh(): Promise<{ fetched: number; source: string }> {
      const source = sourceFor();
      const res = await fetch(ECB_URLS[source]);
      if (!res.ok) throw new Error(`ECB responded ${res.status}`);
      const rates = parseEcbXml(await res.text());
      if (rates.length === 0) throw new Error("ECB response held no rates");
      db.exec("BEGIN");
      try {
        for (const r of rates) upsert.run(r.date, r.base, r.quote, r.rate);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      log.info({ fetched: rates.length, source, latest: latestDate() }, "fx rates updated");
      return { fetched: rates.length, source };
    },

    /** Rates from `since` (inclusive), oldest first, at most `limit` rows. */
    rates(since: string, limit: number): FxRate[] {
      return db
        .prepare(
          "SELECT date, base, quote, rate FROM fx_rates WHERE date >= ? ORDER BY date, quote LIMIT ?",
        )
        .all(since, limit) as unknown as FxRate[];
    },

    /** Registers the weekday job, and fetches once at startup when rates are missing or stale (never throws). */
    register(scheduler: ReturnType<typeof createScheduler>): void {
      scheduler.register({
        name: FX_JOB,
        schedule: FX_SCHEDULE,
        run: async () => {
          const r = await service.refresh();
          return { fetched: r.fetched };
        },
      });
      const last = latestDate();
      if (!last || daysBetween(last, new Date(now())) > 4) {
        void scheduler.runNow(FX_JOB).catch((err) => log.warn({ err }, "initial fx fetch failed"));
      }
    },
  };
  return service;
}

export type FxService = ReturnType<typeof createFxService>;
