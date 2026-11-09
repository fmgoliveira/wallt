import pino from "pino";
import { describe, expect, it } from "vitest";
import { harness } from "../auth/test-harness";
import { createScheduler } from "../scheduler";
import { createFxService, ECB_URLS, type FetchText, parseEcbXml } from "./service";

const log = pino({ level: "silent" });

const xml = (days: Record<string, Record<string, string>>) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<gesmes:subject>Reference rates</gesmes:subject>
<Cube>
${Object.entries(days)
  .map(
    ([date, rates]) =>
      `<Cube time='${date}'>${Object.entries(rates)
        .map(([c, r]) => `<Cube currency='${c}' rate='${r}'/>`)
        .join("")}</Cube>`,
  )
  .join("\n")}
</Cube>
</gesmes:Envelope>`;

/** A fake ECB: records the URLs asked for; `body` can be changed between calls. */
function fakeEcb(body: string, status = 200) {
  const ecb: { body: string; urls: string[]; fetch: FetchText } = {
    body,
    urls: [] as string[],
    fetch: (async (url: string) => {
      ecb.urls.push(url);
      return { ok: status === 200, status, text: async () => ecb.body };
    }) as FetchText,
  };
  return ecb;
}

/** A harness whose server has an FX service reading from a fake ECB at a fixed "now". */
async function setup(body: string, now = "2026-11-07T10:00:00Z", status = 200) {
  const ecb = fakeEcb(body, status);
  let fx: ReturnType<typeof createFxService> | undefined;
  let database: Parameters<typeof createScheduler>[0] | undefined;
  const h = await harness({
    fx: (db) => {
      database = db;
      fx = createFxService({ db, log, fetch: ecb.fetch, clock: () => Date.parse(now) });
      return fx;
    },
  });
  return {
    h,
    ecb,
    fx: fx as ReturnType<typeof createFxService>,
    db: database as Parameters<typeof createScheduler>[0],
  };
}

const sample = xml({
  "2026-11-05": { USD: "1.09" },
  "2026-11-06": { USD: "1.08", GBP: "0.87" },
});

describe("parseEcbXml", () => {
  it("reads every day and currency, keeping the published decimal strings", () => {
    const rates = parseEcbXml(
      xml({
        "2026-11-06": { USD: "1.0837", JPY: "165.50" },
        "2026-11-05": { USD: "1.0900" },
      }),
    );
    expect(rates).toEqual([
      { date: "2026-11-06", base: "EUR", quote: "USD", rate: "1.0837" },
      { date: "2026-11-06", base: "EUR", quote: "JPY", rate: "165.50" },
      { date: "2026-11-05", base: "EUR", quote: "USD", rate: "1.0900" },
    ]);
  });
  it("drops malformed, zero and non-numeric entries", () => {
    const rates = parseEcbXml(
      xml({ "2026-11-06": { USD: "0", ABC: "1e3", GBP: "0.87", EURO: "1" } }),
    );
    expect(rates).toEqual([{ date: "2026-11-06", base: "EUR", quote: "GBP", rate: "0.87" }]);
    expect(parseEcbXml("<html>nope</html>")).toEqual([]);
  });
});

describe("GET /fx/rates", () => {
  it("requires an access token", async () => {
    const { h } = await setup(sample);
    expect((await h.call("GET", "/fx/rates")).status).toBe(401);
  });

  it("serves stored rates from a date, oldest first", async () => {
    const { h, fx } = await setup(sample);
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    await fx.refresh();
    const all = await h.call("GET", "/fx/rates?since=2026-11-05", undefined, auth);
    expect(all.status).toBe(200);
    expect(all.json.latest).toBe("2026-11-06");
    expect(all.json.more).toBe(false);
    expect(
      all.json.rates.map((r: { date: string; quote: string }) => `${r.date}:${r.quote}`),
    ).toEqual(["2026-11-05:USD", "2026-11-06:GBP", "2026-11-06:USD"]);
    expect(
      (await h.call("GET", "/fx/rates?since=2026-11-06", undefined, auth)).json.rates,
    ).toHaveLength(2);
    expect(all.headers.get("cache-control")).toContain("max-age");
  });

  it("defaults to a recent window, rejects a bad date and is empty before the first fetch", async () => {
    const { h, fx } = await setup(sample);
    const { session } = await h.bootstrap();
    const auth = h.bearer(session.accessToken);
    expect((await h.call("GET", "/fx/rates", undefined, auth)).json).toEqual({
      rates: [],
      latest: null,
      more: false,
    });
    await fx.refresh();
    expect((await h.call("GET", "/fx/rates", undefined, auth)).json.rates).toHaveLength(3);
    expect((await h.call("GET", "/fx/rates?since=yesterday", undefined, auth)).status).toBe(400);
  });
});

describe("fx refresh", () => {
  const one = xml({ "2026-11-06": { USD: "1.08" } });

  it("picks the source by how stale the data is", async () => {
    const fresh = await setup(one);
    await fresh.fx.refresh();
    expect(fresh.ecb.urls).toEqual([ECB_URLS.history]); // nothing yet: full history
    await fresh.fx.refresh(); // newest is 11-06, "now" is 11-07: the daily file is enough
    expect(fresh.ecb.urls.at(-1)).toBe(ECB_URLS.daily);

    const stale = await setup(one, "2026-11-20T10:00:00Z");
    await stale.fx.refresh();
    await stale.fx.refresh();
    expect(stale.ecb.urls.at(-1)).toBe(ECB_URLS.last90Days);

    const old = await setup(one, "2027-03-20T10:00:00Z");
    await old.fx.refresh();
    await old.fx.refresh();
    expect(old.ecb.urls.at(-1)).toBe(ECB_URLS.history);
  });

  it("is idempotent and updates a revised rate in place", async () => {
    const s = await setup(one);
    await s.fx.refresh();
    await s.fx.refresh();
    expect(s.fx.rates("2000-01-01", 100)).toHaveLength(1);
    s.ecb.body = xml({ "2026-11-06": { USD: "1.09" } });
    await s.fx.refresh();
    expect(s.fx.rates("2000-01-01", 100)).toEqual([
      { date: "2026-11-06", base: "EUR", quote: "USD", rate: "1.09" },
    ]);
  });

  it("fails loudly on HTTP errors and on responses without rates, storing nothing", async () => {
    const bad = await setup("", "2026-11-07T10:00:00Z", 503);
    await expect(bad.fx.refresh()).rejects.toThrow("503");
    const empty = await setup("<Cube></Cube>");
    await expect(empty.fx.refresh()).rejects.toThrow("no rates");
    expect(empty.fx.latestDate()).toBeNull();
  });
});

describe("fx job", () => {
  it("fetches at startup when empty and records every run in job_runs", async () => {
    const s = await setup(sample);
    const scheduler = createScheduler(s.db, log);
    s.fx.register(scheduler);
    await new Promise((resolve) => setTimeout(resolve, 100)); // the startup fetch is fire and forget
    expect(s.fx.latestDate()).toBe("2026-11-06");
    await scheduler.runNow("fx-rates");
    scheduler.stop();
    const runs = s.db
      .prepare("SELECT status, counts FROM job_runs WHERE job = 'fx-rates'")
      .all() as { status: string; counts: string }[];
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((r) => r.status === "success")).toBe(true);
  });

  it("does not fetch at startup when the data is recent, and survives a failing fetch", async () => {
    const recent = await setup(sample);
    await recent.fx.refresh();
    const before = recent.ecb.urls.length;
    const scheduler = createScheduler(recent.db, log);
    recent.fx.register(scheduler);
    await new Promise((resolve) => setTimeout(resolve, 50));
    scheduler.stop();
    expect(recent.ecb.urls.length).toBe(before);

    const broken = await setup("", "2026-11-07T10:00:00Z", 500);
    const s2 = createScheduler(broken.db, log);
    broken.fx.register(s2); // empty table: tries, fails, must not throw
    await new Promise((resolve) => setTimeout(resolve, 50));
    s2.stop();
    const failed = broken.db
      .prepare("SELECT status FROM job_runs WHERE job = 'fx-rates'")
      .all() as { status: string }[];
    expect(failed.map((r) => r.status)).toEqual(["failed"]);
  });
});
