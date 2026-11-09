import { describe, expect, it } from "vitest";
import { type FxRateRow, pullFxRates } from "./fx";

const rate = (date: string, quote = "USD", r = "1.08"): FxRateRow => ({
  date,
  base: "EUR",
  quote,
  rate: r,
});

function setup(pages: unknown[], opts: { token?: string | null; latest?: string | null } = {}) {
  const stored: FxRateRow[] = [];
  const urls: string[] = [];
  const headers: (HeadersInit | undefined)[] = [];
  let i = 0;
  const run = () =>
    pullFxRates({
      baseUrl: "https://wallt.test/",
      getAccessToken: async () => (opts.token === undefined ? "tok" : opts.token),
      fetch: async (url, init) => {
        urls.push(url);
        headers.push(init?.headers);
        const page = pages[Math.min(i++, pages.length - 1)];
        if (page instanceof Error) throw page;
        if (typeof page === "number") return new Response("{}", { status: page });
        return new Response(JSON.stringify(page), { status: 200 });
      },
      store: {
        latestDate: async () => opts.latest ?? null,
        upsert: async (rows) => {
          stored.push(...rows);
        },
      },
    });
  return { run, stored, urls, headers };
}

describe("pullFxRates", () => {
  it("downloads everything on a first run, authenticated", async () => {
    const s = setup([{ rates: [rate("2026-11-05"), rate("2026-11-06")], more: false }]);
    expect(await s.run()).toEqual({ ok: true, fetched: 2 });
    expect(s.urls).toEqual(["https://wallt.test/fx/rates"]);
    expect(s.headers[0]).toEqual({ authorization: "Bearer tok" });
    expect(s.stored).toHaveLength(2);
  });

  it("asks only for what is newer than the newest stored rate", async () => {
    const s = setup([{ rates: [rate("2026-11-06")], more: false }], { latest: "2026-11-05" });
    await s.run();
    expect(s.urls).toEqual(["https://wallt.test/fx/rates?since=2026-11-05"]);
  });

  it("follows pages until the server has no more", async () => {
    const s = setup([
      { rates: [rate("2026-11-01"), rate("2026-11-02")], more: true },
      { rates: [rate("2026-11-02", "GBP"), rate("2026-11-03")], more: false },
    ]);
    expect(await s.run()).toEqual({ ok: true, fetched: 4 });
    expect(s.urls).toEqual([
      "https://wallt.test/fx/rates",
      "https://wallt.test/fx/rates?since=2026-11-02",
    ]);
  });

  it("stops when a page makes no progress", async () => {
    const s = setup([{ rates: [rate("2026-11-02")], more: true }], { latest: "2026-11-02" });
    expect(await s.run()).toEqual({ ok: true, fetched: 1 });
    expect(s.urls).toHaveLength(1);
  });

  it("stops after a bounded number of pages", async () => {
    let day = 10;
    const pages = Array.from({ length: 50 }, () => ({
      rates: [rate(`2026-11-${String((day++ % 28) + 1).padStart(2, "0")}`)],
      more: true,
    }));
    const s = setup(pages);
    await s.run();
    expect(s.urls.length).toBeLessThanOrEqual(20);
  });

  it("drops malformed rows instead of storing them", async () => {
    const s = setup([
      {
        rates: [
          rate("2026-11-06"),
          { ...rate("2026-11-06"), rate: "0" },
          { ...rate("2026-11-06"), rate: "abc" },
          { ...rate("2026-11-06"), base: "USD" },
          { ...rate("nope") },
          { ...rate("2026-11-06"), quote: "usd" },
          null,
          "x",
        ],
        more: false,
      },
    ]);
    expect(await s.run()).toEqual({ ok: true, fetched: 1 });
    expect(s.stored).toEqual([rate("2026-11-06")]);
  });

  it("tolerates an empty or odd response", async () => {
    expect(await setup([{ rates: [], more: false }]).run()).toEqual({ ok: true, fetched: 0 });
    expect(await setup([{}]).run()).toEqual({ ok: true, fetched: 0 });
  });

  it("never throws: signed out, HTTP errors and network failures are results", async () => {
    expect(await setup([{}], { token: null }).run()).toEqual({
      ok: false,
      reason: "not signed in",
    });
    expect(await setup([503]).run()).toEqual({ ok: false, reason: "HTTP 503" });
    expect(await setup([new Error("offline")]).run()).toEqual({ ok: false, reason: "offline" });
    expect(await setup([new Error("x")]).run()).toMatchObject({ ok: false });
  });
});
