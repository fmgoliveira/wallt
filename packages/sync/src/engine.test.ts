import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncEngine, type SyncTransport, SyncTransportError } from "./engine";
import { createHttpTransport } from "./http";
import type { Change, PullResponse, PushRequest, PushResponse } from "./protocol";
import type { SyncStorePort } from "./store";

function fakeStore(initial: Change[] = []) {
  const meta = new Map<string, string>();
  let queue = [...initial];
  let cursor = 0;
  const applied: number[] = [];
  const store: SyncStorePort & { queue: () => Change[]; add: (c: Change) => void } = {
    queue: () => queue,
    add: (c) => queue.push(c),
    pending: async (n) => queue.slice(0, n),
    counts: async () => ({ pending: queue.length, failed: 0 }),
    acknowledge: async (pushed, res) => {
      const ok = new Set(res.accepted.map((a) => a.id));
      queue = queue.filter((c) => !(ok.has(c.id) && pushed.includes(c)));
    },
    applyPulled: async (rows, c) => {
      applied.push(rows.length);
      cursor = c;
      return { applied: rows.length };
    },
    getCursor: async () => cursor,
    getMeta: async (k) => meta.get(k) ?? null,
    setMeta: async (k, v) => void meta.set(k, v),
    maxHlc: async () => "",
  };
  return Object.assign(store, { applied, meta });
}

const change = (id: string): Change => ({
  table: "accounts",
  id,
  op: "put",
  hlc: "000000000001-0000-n",
  row: { id, hlc: "000000000001-0000-n" },
});

const page = (n: number, cursor: number, hasMore: boolean): PullResponse => ({
  changes: Array.from({ length: n }, (_, i) => ({
    table: "accounts" as const,
    row: { id: `r${cursor}-${i}`, hlc: "000000000002-0000-s" },
  })),
  cursor,
  hasMore,
  schemaVersion: 3,
});

function transport(over: Partial<SyncTransport> = {}) {
  const t = {
    push: vi.fn(
      async (req: PushRequest): Promise<PushResponse> => ({
        accepted: req.changes.map((c, i) => ({
          table: c.table,
          id: c.id,
          hlc: c.hlc,
          serverSeq: i + 1,
        })),
        rejected: [],
        schemaVersion: 3,
      }),
    ),
    pull: vi.fn(async (): Promise<PullResponse> => page(0, 0, false)),
    ...over,
  } as SyncTransport & { push: ReturnType<typeof vi.fn>; pull: ReturnType<typeof vi.fn> };
  return t;
}

const make = (store: SyncStorePort, tr: SyncTransport, extra = {}) =>
  createSyncEngine({ store, transport: tr, deviceId: "d", schemaVersion: 3, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sync engine", () => {
  it("pushes the outbox, then pulls every page, and records the time", async () => {
    const store = fakeStore([change("a"), change("b")]);
    const tr = transport();
    tr.pull.mockResolvedValueOnce(page(2, 5, true)).mockResolvedValueOnce(page(1, 6, false));
    vi.setSystemTime(1_700_000_000_000);
    const engine = make(store, tr);
    await engine.syncNow();
    expect(tr.push).toHaveBeenCalledTimes(1);
    expect(store.queue()).toEqual([]);
    expect(store.applied).toEqual([2, 1]);
    expect(tr.pull.mock.calls[1]?.[0]).toMatchObject({ since: 5 });
    expect(engine.getState()).toMatchObject({
      problem: null,
      pending: 0,
      lastSyncedAt: 1_700_000_000_000,
      syncing: false,
    });
    expect(store.meta.get("last_sync_at")).toBe("1700000000000");
  });

  it("feeds pulled clock values into the clock", async () => {
    const store = fakeStore();
    const tr = transport();
    tr.pull.mockResolvedValueOnce(page(2, 2, false));
    const receive = vi.fn(() => true);
    await make(store, tr, {
      clock: { receive, now: () => "", last: () => "", node: "n" },
    }).syncNow();
    expect(receive).toHaveBeenCalledTimes(2);
  });

  it("reports offline and keeps the outbox, then recovers", async () => {
    const store = fakeStore([change("a")]);
    const tr = transport();
    tr.push.mockRejectedValueOnce(new SyncTransportError("offline"));
    const engine = make(store, tr);
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ problem: "offline", pending: 1, lastSyncedAt: null });
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ problem: null, pending: 0 });
  });

  it("maps auth and schema errors, and unknown errors to server", async () => {
    for (const [err, kind] of [
      [new SyncTransportError("unauthorized"), "unauthorized"],
      [new SyncTransportError("schema_outdated"), "schema_outdated"],
      [new Error("boom"), "server"],
    ] as const) {
      const tr = transport({ pull: vi.fn().mockRejectedValue(err) });
      const engine = make(fakeStore(), tr);
      await engine.syncNow();
      expect(engine.getState().problem).toBe(kind);
    }
  });

  it("stops pushing when the server only refuses (no endless loop)", async () => {
    const store = fakeStore([change("a")]);
    const tr = transport({
      push: vi.fn(async () => ({
        accepted: [],
        rejected: [{ table: "accounts" as const, id: "a", hlc: "x", reason: "invalid" as const }],
        schemaVersion: 3,
      })),
    });
    await make(store, tr).syncNow();
    expect(tr.push).toHaveBeenCalledTimes(1);
  });

  it("shares one run between concurrent calls and goes once more after a mid-sync write", async () => {
    const store = fakeStore([change("a")]);
    let release: () => void = () => undefined;
    const tr = transport();
    tr.push.mockImplementationOnce(
      (req) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              accepted: req.changes.map((c: Change) => ({
                table: c.table,
                id: c.id,
                hlc: c.hlc,
                serverSeq: 1,
              })),
              rejected: [],
              schemaVersion: 3,
            });
        }),
    );
    const engine = make(store, tr);
    const first = engine.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    store.add(change("b")); // written while the first push is in flight
    const second = engine.syncNow();
    release();
    await Promise.all([first, second]);
    expect(store.queue()).toEqual([]);
    expect(tr.push).toHaveBeenCalledTimes(2);
  });

  it("debounces local writes by 2 s and syncs on the interval", async () => {
    const store = fakeStore();
    const tr = transport();
    const engine = make(store, tr);
    await engine.start();
    expect(tr.pull).toHaveBeenCalledTimes(1);

    engine.notifyLocalWrite();
    engine.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(1999);
    expect(tr.pull).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(tr.pull).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(tr.pull).toHaveBeenCalledTimes(3);
    engine.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(tr.pull).toHaveBeenCalledTimes(3);
  });

  it("notifies subscribers and restores lastSyncedAt on start", async () => {
    const store = fakeStore();
    store.meta.set("last_sync_at", "123");
    const engine = make(store, transport());
    const seen: boolean[] = [];
    const off = engine.subscribe((s) => seen.push(s.syncing));
    await engine.start();
    engine.stop();
    off();
    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
    expect(engine.getState().lastSyncedAt).not.toBeNull();
  });
});

describe("http transport", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const opts = (
    fetch: (u: string, i?: RequestInit) => Promise<Response>,
    token: string | null = "tok",
  ) => ({
    baseUrl: "https://x.test/",
    getAccessToken: async () => token,
    fetch,
  });

  it("sends the bearer token and JSON body, builds the pull url", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const t = createHttpTransport(
      opts(async (u, i) => {
        calls.push([u, i]);
        return ok({
          accepted: [],
          rejected: [],
          schemaVersion: 3,
          changes: [],
          cursor: 0,
          hasMore: false,
        });
      }),
    );
    await t.push({ deviceId: "d", schemaVersion: 3, changes: [] });
    await t.pull({ since: 7, limit: 10, schemaVersion: 3 });
    expect(calls[0]?.[0]).toBe("https://x.test/sync/push");
    expect((calls[0]?.[1]?.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Bearer tok",
    );
    expect(calls[1]?.[0]).toBe("https://x.test/sync/pull?since=7&limit=10&schemaVersion=3");
  });

  it("maps failures to transport error kinds", async () => {
    const kind = async (res: () => Promise<Response>, token: string | null = "tok") =>
      createHttpTransport(opts(res, token))
        .pull({ since: 0, limit: 1, schemaVersion: 3 })
        .then(
          () => "ok",
          (e: SyncTransportError) => e.kind,
        );
    expect(await kind(async () => Promise.reject(new TypeError("fetch failed")))).toBe("offline");
    expect(await kind(async () => new Response("", { status: 401 }))).toBe("unauthorized");
    expect(await kind(async () => ok({}), null)).toBe("unauthorized");
    expect(
      await kind(
        async () => new Response(JSON.stringify({ error: "schema_outdated" }), { status: 409 }),
      ),
    ).toBe("schema_outdated");
    expect(
      await kind(
        async () => new Response(JSON.stringify({ error: "server_outdated" }), { status: 409 }),
      ),
    ).toBe("server_outdated");
    expect(await kind(async () => new Response("", { status: 503 }))).toBe("offline");
    expect(await kind(async () => new Response("", { status: 500 }))).toBe("server");
  });
});
