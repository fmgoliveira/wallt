/**
 * Download of the ECB reference rates from `GET /fx/rates` into the local copy. Not part of the sync protocol:
 * rates are server-owned reference data, not user rows. IO is injected, so this stays testable.
 */

export interface FxRateRow {
  date: string;
  base: string;
  quote: string;
  rate: string;
}

export interface FxStore {
  latestDate(): Promise<string | null>;
  upsert(rows: readonly FxRateRow[]): Promise<void>;
}

export interface PullFxOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  store: FxStore;
}

export type PullFxResult = { ok: true; fetched: number } | { ok: false; reason: string };

/** Safety net against a misbehaving server: pages per run. */
const MAX_PAGES = 20;

const isRate = (r: unknown): r is FxRateRow => {
  const x = r as Partial<Record<keyof FxRateRow, unknown>> | null;
  return (
    !!x &&
    typeof x.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    x.base === "EUR" &&
    typeof x.quote === "string" &&
    /^[A-Z]{3}$/.test(x.quote) &&
    typeof x.rate === "string" &&
    /^\d+(\.\d+)?$/.test(x.rate) &&
    Number(x.rate) > 0
  );
};

/**
 * Fetches rates newer than what the device holds (everything the server offers on a first run) and stores them.
 * Never throws: offline, signed out or a server error just means conversions keep using the last known rates.
 */
export async function pullFxRates(options: PullFxOptions): Promise<PullFxResult> {
  const base = options.baseUrl.replace(/\/+$/, "");
  let fetched = 0;
  try {
    const token = await options.getAccessToken();
    if (!token) return { ok: false, reason: "not signed in" };
    let since = await options.store.latestDate();
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await options.fetch(`${base}/fx/rates${since ? `?since=${since}` : ""}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const body = (await res.json()) as { rates?: unknown; more?: unknown };
      const rows = Array.isArray(body.rates) ? body.rates.filter(isRate) : [];
      if (rows.length > 0) {
        await options.store.upsert(rows);
        fetched += rows.length;
      }
      const last = rows.at(-1)?.date ?? null;
      // A full page may end mid-day, so ask again from that day (upserts make the overlap harmless).
      if (body.more !== true || last === null || last === since) break;
      since = last;
    }
    return { ok: true, fetched };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : "failed" };
  }
}
