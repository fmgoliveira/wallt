import { describe, expect, it } from "vitest";
import { MODEL_JSON_KEY, MODEL_VERSION_KEY, pullModel, readStoredModel } from "./ml";

function setup(
  responses: (Response | Error)[],
  opts: { token?: string | null; have?: { version: number; json: string } } = {},
) {
  const meta = new Map<string, string>();
  if (opts.have) {
    meta.set(MODEL_VERSION_KEY, String(opts.have.version));
    meta.set(MODEL_JSON_KEY, opts.have.json);
  }
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const store = {
    getMeta: async (k: string) => meta.get(k) ?? null,
    setMeta: async (k: string, v: string) => {
      meta.set(k, v);
    },
  };
  const run = () =>
    pullModel({
      baseUrl: "https://wallt.test/",
      getAccessToken: async () => (opts.token === undefined ? "tok" : opts.token),
      fetch: async (url, init) => {
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
        const r = responses[Math.min(i++, responses.length - 1)] as Response | Error;
        if (r instanceof Error) throw r;
        return r;
      },
      store,
    });
  return { run, meta, calls, store };
}

const ok = (version: number, model: object = { k: 1 }) =>
  new Response(JSON.stringify({ version, model, metrics: {} }), { status: 200 });

describe("pullModel", () => {
  it("downloads and stores the model on a first run, authenticated", async () => {
    const s = setup([ok(3)]);
    expect(await s.run()).toEqual({ ok: true, changed: true, version: 3 });
    expect(s.calls[0]?.url).toBe("https://wallt.test/ml/model");
    expect(s.calls[0]?.headers.authorization).toBe("Bearer tok");
    expect(s.calls[0]?.headers["if-none-match"]).toBeUndefined();
    expect(await readStoredModel(s.store)).toEqual({ version: 3, json: '{"k":1}' });
  });

  it("asks for a newer version only and keeps the stored one on 304", async () => {
    const s = setup([new Response(null, { status: 304 })], {
      have: { version: 2, json: '{"old":1}' },
    });
    expect(await s.run()).toEqual({ ok: true, changed: false, version: 2 });
    expect(s.calls[0]?.headers["if-none-match"]).toBe('"v2"');
    expect((await readStoredModel(s.store))?.json).toBe('{"old":1}');
  });

  it("replaces an older model", async () => {
    const s = setup([ok(4, { n: 4 })], { have: { version: 2, json: "{}" } });
    expect(await s.run()).toEqual({ ok: true, changed: true, version: 4 });
    expect((await readStoredModel(s.store))?.version).toBe(4);
  });

  it("keeps the stored model when the server has none (204), errors or garbage", async () => {
    const have = { version: 2, json: '{"old":1}' };
    for (const r of [
      new Response(null, { status: 204 }),
      new Response("{}", { status: 500 }),
      new Response('{"version":"x","model":{}}', { status: 200 }),
      new Response('{"version":5}', { status: 200 }),
      new Error("offline"),
    ]) {
      const s = setup([r], { have });
      const out = await s.run();
      expect(await readStoredModel(s.store)).toEqual(have);
      if (!(r instanceof Response && r.status === 204)) expect(out.ok).toBe(false);
    }
  });

  it("does nothing while signed out", async () => {
    const s = setup([ok(1)], { token: null });
    expect(await s.run()).toEqual({ ok: false, reason: "not signed in" });
    expect(s.calls).toHaveLength(0);
  });
});
