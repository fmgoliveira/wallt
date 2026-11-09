import { describe, expect, it, vi } from "vitest";
import {
  type AuthClientError,
  createAuthClient,
  createSessionManager,
  normalizeServerUrl,
  type SessionStorage,
  type StoredSession,
} from "./auth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const device = { deviceId: "dev-1", deviceName: "Pixel", platform: "android" as const };

describe("normalizeServerUrl", () => {
  it("defaults to https, strips paths, accepts http only for local hosts", () => {
    expect(normalizeServerUrl(" wallt.example.com/app ")).toBe("https://wallt.example.com");
    expect(normalizeServerUrl("https://wallt.example.com:8443/x")).toBe(
      "https://wallt.example.com:8443",
    );
    expect(normalizeServerUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeServerUrl("http://10.0.2.2:3000")).toBe("http://10.0.2.2:3000");
    expect(normalizeServerUrl("http://192.168.1.5")).toBe("http://192.168.1.5");
    expect(normalizeServerUrl("http://nas.local:8080")).toBe("http://nas.local:8080");
  });
  it("rejects plain http to the internet and junk", () => {
    expect(normalizeServerUrl("http://wallt.example.com")).toBeNull();
    expect(normalizeServerUrl("http://172.15.0.1")).toBeNull();
    expect(normalizeServerUrl("ftp://x")).toBeNull();
    expect(normalizeServerUrl("")).toBeNull();
    expect(normalizeServerUrl("not a url")).toBeNull();
  });
});

describe("auth client", () => {
  const client = (fetch: (u: string, i?: RequestInit) => Promise<Response>) =>
    createAuthClient({ baseUrl: "https://s", fetch, device, now: () => 1000 });

  it("login then verify builds a session with the profile", async () => {
    const calls: string[] = [];
    const c = client(async (url, init) => {
      calls.push(url);
      if (url.endsWith("/auth/login"))
        return json({ status: "mfa_required", challengeToken: "ch" });
      if (url.endsWith("/auth/login/verify")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          challengeToken: "ch",
          code: "123456",
          deviceId: "dev-1",
        });
        return json({ accessToken: "a", refreshToken: "r", expiresIn: 900, deviceId: "dev-1" });
      }
      return json({ userId: "u1", email: "me@x.io" });
    });
    expect(await c.login("me@x.io", "pw")).toEqual({
      status: "mfa_required",
      challengeToken: "ch",
    });
    expect(await c.verify("ch", { code: "123456" })).toEqual({
      baseUrl: "https://s",
      userId: "u1",
      email: "me@x.io",
      deviceId: "dev-1",
      accessToken: "a",
      accessExpiresAt: 1000 + 900_000,
      refreshToken: "r",
    });
    expect(calls).toHaveLength(3);
  });

  it("reports enrolment, and maps failures", async () => {
    expect(await client(async () => json({ status: "enrol_required" })).login("a", "b")).toEqual({
      status: "enrol_required",
    });
    const kind = (res: () => Promise<Response>) =>
      client(res)
        .login("a", "b")
        .then(
          () => "ok",
          (e: AuthClientError) => e.kind,
        );
    expect(await kind(async () => json({ error: "invalid_credentials" }, 401))).toBe(
      "invalid_credentials",
    );
    expect(await kind(async () => json({ error: "locked" }, 429))).toBe("locked");
    expect(await kind(async () => json({ error: "rate_limited" }, 429))).toBe("rate_limited");
    expect(await kind(async () => Promise.reject(new TypeError("x")))).toBe("offline");
    expect(await kind(async () => json({}, 500))).toBe("server");
    const v = await client(async () => json({ error: "invalid_token" }, 401))
      .verify("c", { code: "1" })
      .then(
        () => "ok",
        (e: AuthClientError) => e.kind,
      );
    expect(v).toBe("expired");
  });
});

describe("session manager", () => {
  const session: StoredSession = {
    baseUrl: "https://s",
    userId: "u",
    email: "e",
    deviceId: "d",
    accessToken: "old",
    accessExpiresAt: 10_000,
    refreshToken: "r1",
  };
  const storage = (): SessionStorage & { saved: StoredSession[]; cleared: number } => {
    const s = { saved: [] as StoredSession[], cleared: 0 } as SessionStorage & {
      saved: StoredSession[];
      cleared: number;
    };
    s.load = async () => null;
    s.save = async (x) => void s.saved.push(x);
    s.clear = async () => void s.cleared++;
    return s;
  };

  it("returns the cached token while it is fresh, null when signed out", async () => {
    const f = vi.fn();
    const m = createSessionManager({
      storage: storage(),
      fetch: f,
      initial: { ...session, accessExpiresAt: 1_000_000 },
      now: () => 1000,
    });
    expect(await m.getAccessToken()).toBe("old");
    expect(f).not.toHaveBeenCalled();
    expect(
      await createSessionManager({ storage: storage(), fetch: f, initial: null }).getAccessToken(),
    ).toBeNull();
  });

  it("refreshes once for concurrent callers and persists the rotated refresh token", async () => {
    const st = storage();
    const f = vi.fn(async () => json({ accessToken: "new", refreshToken: "r2", expiresIn: 900 }));
    const m = createSessionManager({ storage: st, fetch: f, initial: session, now: () => 9_500 });
    const [a, b] = await Promise.all([m.getAccessToken(), m.getAccessToken()]);
    expect([a, b]).toEqual(["new", "new"]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(st.saved[0]).toMatchObject({
      refreshToken: "r2",
      accessToken: "new",
      accessExpiresAt: 9_500 + 900_000,
    });
    expect(m.current()?.refreshToken).toBe("r2");
  });

  it("keeps the session when offline, drops it when the server refuses", async () => {
    const st = storage();
    const off = createSessionManager({
      storage: st,
      fetch: async () => Promise.reject(new TypeError("x")),
      initial: session,
      now: () => 9_500,
    });
    expect(await off.getAccessToken()).toBeNull();
    expect(off.current()).not.toBeNull();

    const onOut = vi.fn();
    const refused = createSessionManager({
      storage: st,
      fetch: async () => json({ error: "invalid_token" }, 401),
      initial: session,
      now: () => 9_500,
      onSignedOut: onOut,
    });
    expect(await refused.getAccessToken()).toBeNull();
    expect(refused.current()).toBeNull();
    expect(st.cleared).toBe(1);
    expect(onOut).toHaveBeenCalled();
  });
});
