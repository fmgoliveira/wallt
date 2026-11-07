import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { openDatabase, runMigrations } from "../database";
import { deriveKeys } from "./crypto";
import { createAuthService, LOCK_MS, REFRESH_TTL_MS } from "./service";
import { generateTotp } from "./totp";

vi.setConfig({ testTimeout: 30_000 });

// biome-ignore lint/suspicious/noExplicitAny: JSON test payloads
type J = Record<string, any>;

const log = pino({ level: "silent" });
const KEY = Buffer.alloc(32, 7).toString("base64");
const SETUP = "setup-token-0123456789";
const EMAIL = "owner@example.com";
const PASSWORD = "correct horse battery staple";
const dirs: string[] = [];
const dbs: { close(): void }[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close(); // Windows cannot delete open SQLite files
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function harness(opts: { setupToken?: string | undefined } = { setupToken: SETUP }) {
  const dir = mkdtempSync(join(tmpdir(), "wallt-auth-"));
  dirs.push(dir);
  const db = openDatabase(dir);
  dbs.push(db);
  await runMigrations(db, dir, log);
  let t = Date.UTC(2026, 0, 1, 12, 0, 0);
  const now = () => t;
  const auth = createAuthService({
    db,
    log,
    keys: deriveKeys(KEY),
    setupToken: opts.setupToken,
    now,
  });
  const app = createApp({ db, log, auth, clock: now });
  let n = 0;
  // Every call comes from a fresh "client IP" (via a trusted proxy) unless a test pins one.
  const call = async (
    method: string,
    path: string,
    body?: object,
    headers: Record<string, string> = {},
    ip?: string,
  ) => {
    const res = await app.request(
      path,
      {
        method,
        headers: {
          "content-type": "application/json",
          "x-real-ip": ip ?? `10.0.${Math.floor(++n / 250)}.${n % 250}`,
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 1, remoteFamily: "IPv4" } } },
    );
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: (text ? JSON.parse(text) : {}) as J };
  };
  const post = (path: string, body: object, ip?: string) => call("POST", path, body, {}, ip);
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const dev = { deviceName: "Pixel", platform: "android" };

  /** Full first-run: setup + 2FA confirm. Returns the session, TOTP secret and recovery codes. */
  async function bootstrap() {
    const s = await post("/auth/setup", { setupToken: SETUP, email: EMAIL, password: PASSWORD });
    const c = await post("/auth/2fa/confirm", {
      enrolToken: s.json.enrolToken,
      code: generateTotp(s.json.secret, t),
      ...dev,
    });
    return {
      secret: s.json.secret as string,
      session: c.json,
      recoveryCodes: c.json.recoveryCodes as string[],
    };
  }
  /** Password + TOTP login on a new device. Advances time so the TOTP step is fresh. */
  async function login(secret: string, device: object = dev) {
    const p = await post("/auth/login", { email: EMAIL, password: PASSWORD });
    t += 30_000;
    const v = await post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      code: generateTotp(secret, t),
      ...device,
    });
    return v.json;
  }
  return {
    app,
    db,
    call,
    post,
    bearer,
    dev,
    bootstrap,
    login,
    now,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("setup and 2FA enrolment", () => {
  it("is disabled unless SETUP_TOKEN is configured", async () => {
    const h = await harness({ setupToken: undefined });
    const r = await h.post("/auth/setup", { setupToken: SETUP, email: EMAIL, password: PASSWORD });
    expect(r).toMatchObject({ status: 403, json: { error: "setup_disabled" } });
  });

  it("requires the setup token, a valid email and a 12+ char password", async () => {
    const h = await harness();
    expect(
      (await h.post("/auth/setup", { setupToken: "nope", email: EMAIL, password: PASSWORD })).json
        .error,
    ).toBe("invalid_setup_token");
    expect(
      (await h.post("/auth/setup", { setupToken: SETUP, email: "bad", password: PASSWORD })).status,
    ).toBe(400);
    expect(
      (await h.post("/auth/setup", { setupToken: SETUP, email: EMAIL, password: "short" })).status,
    ).toBe(400);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 0 });
  });

  it("creates the user with a hashed password and an encrypted TOTP secret, then closes for good", async () => {
    const h = await harness();
    const r = await h.post("/auth/setup", {
      setupToken: SETUP,
      email: " Owner@Example.com ",
      password: PASSWORD,
    });
    expect(r.status).toBe(200);
    expect(r.json.otpauthUri).toContain("otpauth://totp/Wallt:owner%40example.com");
    const row = h.db.prepare("SELECT * FROM users").get() as J;
    expect(row.email).toBe(EMAIL);
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
    expect(row.totp_secret_enc).toMatch(/^v1\./);
    expect(row.totp_secret_enc).not.toContain(r.json.secret);
    expect(row.totp_enabled_at).toBeNull();
    const again = await h.post("/auth/setup", {
      setupToken: SETUP,
      email: "other@example.com",
      password: PASSWORD,
    });
    expect(again).toMatchObject({ status: 409, json: { error: "setup_closed" } });
  });

  it("only two concurrent setups succeed once", async () => {
    const h = await harness();
    const body = { setupToken: SETUP, email: EMAIL, password: PASSWORD };
    const [a, b] = await Promise.all([h.post("/auth/setup", body), h.post("/auth/setup", body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("confirms enrolment with a valid code, returns hashed single-use recovery codes and a session", async () => {
    const h = await harness();
    const s = await h.post("/auth/setup", { setupToken: SETUP, email: EMAIL, password: PASSWORD });
    const bad = await h.post("/auth/2fa/confirm", {
      enrolToken: s.json.enrolToken,
      code: "000000",
      ...h.dev,
    });
    expect(bad).toMatchObject({ status: 401, json: { error: "invalid_code" } });
    const ok = await h.post("/auth/2fa/confirm", {
      enrolToken: s.json.enrolToken,
      code: generateTotp(s.json.secret, h.now()),
      ...h.dev,
    });
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodes).toHaveLength(10);
    for (const c of ok.json.recoveryCodes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    const stored = (h.db.prepare("SELECT recovery_codes FROM users").get() as J)
      .recovery_codes as string;
    for (const c of ok.json.recoveryCodes) expect(stored).not.toContain(c.replace("-", ""));
    const me = await h.call("GET", "/auth/me", undefined, h.bearer(ok.json.accessToken));
    expect(me.json).toMatchObject({ email: EMAIL });
    const twice = await h.post("/auth/2fa/confirm", {
      enrolToken: s.json.enrolToken,
      code: generateTotp(s.json.secret, h.now() + 30_000),
      ...h.dev,
    });
    expect(twice.json.error).toBe("already_enrolled");
  });

  it("forces enrolment on login when 2FA was never completed (cannot be skipped)", async () => {
    const h = await harness();
    await h.post("/auth/setup", { setupToken: SETUP, email: EMAIL, password: PASSWORD });
    const l = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    expect(l.json.status).toBe("enrol_required");
    expect(l.json.accessToken).toBeUndefined();
    const me = await h.call("GET", "/auth/me", undefined, h.bearer(l.json.enrolToken));
    expect(me.status).toBe(401); // an enrolment token is not an access token
  });
});

describe("login with mandatory 2FA", () => {
  it("gives no session after the password alone; TOTP completes it", async () => {
    const h = await harness();
    const { secret } = await h.bootstrap();
    h.advance(30_000);
    const p = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    expect(p.json).toMatchObject({ status: "mfa_required" });
    expect(p.json.accessToken).toBeUndefined();
    expect(p.json.refreshToken).toBeUndefined();
    const v = await h.post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      code: generateTotp(secret, h.now()),
      ...h.dev,
    });
    expect(v.status).toBe(200);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(v.json.accessToken))).status).toBe(
      200,
    );
  });

  it("does not reveal whether the account exists", async () => {
    const h = await harness();
    await h.bootstrap();
    const wrongPw = await h.post("/auth/login", { email: EMAIL, password: "wrong password!" });
    const noUser = await h.post("/auth/login", {
      email: "nobody@example.com",
      password: "wrong password!",
    });
    expect(wrongPw).toMatchObject({ status: 401, json: { error: "invalid_credentials" } });
    expect(noUser.status).toBe(wrongPw.status);
    expect(noUser.json).toEqual(wrongPw.json);
  });

  it("rejects a reused TOTP code, expired challenges and token confusion", async () => {
    const h = await harness();
    const { secret, session } = await h.bootstrap();
    h.advance(30_000);
    const code = generateTotp(secret, h.now());
    const p1 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    expect(
      (
        await h.post("/auth/login/verify", {
          challengeToken: p1.json.challengeToken,
          code,
          ...h.dev,
        })
      ).status,
    ).toBe(200);
    const p2 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    expect(
      (
        await h.post("/auth/login/verify", {
          challengeToken: p2.json.challengeToken,
          code,
          ...h.dev,
        })
      ).json.error,
    ).toBe("invalid_code");
    h.advance(31_000);
    const p3 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    h.advance(5 * 60_000 + 1000);
    expect(
      (
        await h.post("/auth/login/verify", {
          challengeToken: p3.json.challengeToken,
          code: generateTotp(secret, h.now()),
          ...h.dev,
        })
      ).json.error,
    ).toBe("invalid_token");
    // an access token is not a challenge; a challenge is not an access token
    expect(
      (
        await h.post("/auth/login/verify", {
          challengeToken: session.accessToken,
          code: generateTotp(secret, h.now()),
          ...h.dev,
        })
      ).status,
    ).toBe(401);
    expect(
      (await h.call("GET", "/auth/me", undefined, h.bearer(p3.json.challengeToken))).status,
    ).toBe(401);
  });

  it("requires exactly one of code / recoveryCode", async () => {
    const h = await harness();
    const { secret } = await h.bootstrap();
    h.advance(30_000);
    const p = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const base = { challengeToken: p.json.challengeToken, ...h.dev };
    expect((await h.post("/auth/login/verify", base)).status).toBe(400);
    expect(
      (
        await h.post("/auth/login/verify", {
          ...base,
          code: generateTotp(secret, h.now()),
          recoveryCode: "AAAAA-BBBBB",
        })
      ).status,
    ).toBe(400);
  });

  it("accepts each recovery code exactly once", async () => {
    const h = await harness();
    const { recoveryCodes } = await h.bootstrap();
    const code = recoveryCodes[3] as string;
    const p1 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const ok = await h.post("/auth/login/verify", {
      challengeToken: p1.json.challengeToken,
      recoveryCode: code.toLowerCase().replace("-", " "),
      ...h.dev,
    });
    expect(ok.status).toBe(200);
    const p2 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const reuse = await h.post("/auth/login/verify", {
      challengeToken: p2.json.challengeToken,
      recoveryCode: code,
      ...h.dev,
    });
    expect(reuse).toMatchObject({ status: 401, json: { error: "invalid_code" } });
    const other = await h.post("/auth/login/verify", {
      challengeToken: p2.json.challengeToken,
      recoveryCode: recoveryCodes[4],
      ...h.dev,
    });
    expect(other.status).toBe(200);
  });
});

describe("lockout and rate limiting", () => {
  it("locks the account after 5 wrong second-factor attempts, even for the right code, until it expires", async () => {
    const h = await harness();
    const { secret } = await h.bootstrap();
    h.advance(30_000);
    const p = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    for (let i = 0; i < 5; i++) {
      const r = await h.post("/auth/login/verify", {
        challengeToken: p.json.challengeToken,
        code: "000000",
        ...h.dev,
      });
      expect(r.json.error).toBe("invalid_code");
    }
    const locked = await h.post("/auth/login/verify", {
      challengeToken: p.json.challengeToken,
      code: generateTotp(secret, h.now()),
      ...h.dev,
    });
    expect(locked.status).toBe(429);
    expect(locked.json.error).toBe("locked");
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await h.post("/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(429);
    h.advance(LOCK_MS + 1000);
    const p2 = await h.post("/auth/login", { email: EMAIL, password: PASSWORD });
    const ok = await h.post("/auth/login/verify", {
      challengeToken: p2.json.challengeToken,
      code: generateTotp(secret, h.now()),
      ...h.dev,
    });
    expect(ok.status).toBe(200);
    expect(h.db.prepare("SELECT failed_attempts, locked_until FROM users").get()).toEqual({
      failed_attempts: 0,
      locked_until: null,
    });
  });

  it("locks after 5 wrong passwords and a correct password alone does not reset the counter", async () => {
    const h = await harness();
    await h.bootstrap();
    for (let i = 0; i < 4; i++)
      await h.post("/auth/login", { email: EMAIL, password: "wrong password!" });
    await h.post("/auth/login", { email: EMAIL, password: PASSWORD }); // correct password, no 2FA yet
    expect((h.db.prepare("SELECT failed_attempts AS n FROM users").get() as J).n).toBe(4);
    await h.post("/auth/login", { email: EMAIL, password: "wrong password!" });
    expect((await h.post("/auth/login", { email: EMAIL, password: PASSWORD })).json.error).toBe(
      "locked",
    );
  });

  it("limits attempts per client IP and recovers after the window", async () => {
    const h = await harness();
    const ip = "203.0.113.50";
    for (let i = 0; i < 10; i++)
      expect(
        (await h.post("/auth/login", { email: "x@example.com", password: "wrong password!" }, ip))
          .status,
      ).toBe(401);
    const blocked = await h.post(
      "/auth/login",
      { email: "x@example.com", password: "wrong password!" },
      ip,
    );
    expect(blocked).toMatchObject({ status: 429, json: { error: "rate_limited" } });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(
      (
        await h.post(
          "/auth/login",
          { email: "x@example.com", password: "wrong password!" },
          "203.0.113.51",
        )
      ).status,
    ).toBe(401);
    h.advance(15 * 60_000 + 1000);
    expect(
      (await h.post("/auth/login", { email: "x@example.com", password: "wrong password!" }, ip))
        .status,
    ).toBe(401);
  });
});

describe("refresh tokens and sessions", () => {
  it("rotates refresh tokens and expires access tokens after 15 minutes", async () => {
    const h = await harness();
    const { session } = await h.bootstrap();
    h.advance(14 * 60_000);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(session.accessToken))).status).toBe(
      200,
    );
    h.advance(2 * 60_000);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(session.accessToken))).status).toBe(
      401,
    );
    const r = await h.post("/auth/refresh", { refreshToken: session.refreshToken });
    expect(r.status).toBe(200);
    expect(r.json.refreshToken).not.toBe(session.refreshToken);
    expect(r.json.deviceId).toBe(session.deviceId);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(r.json.accessToken))).status).toBe(
      200,
    );
    const stored = h.db.prepare("SELECT token_hash FROM refresh_tokens").all() as J[];
    for (const row of stored)
      expect([session.refreshToken, r.json.refreshToken]).not.toContain(row.token_hash);
  });

  it("revokes the whole family when an old refresh token is replayed", async () => {
    const h = await harness();
    const { session } = await h.bootstrap();
    const r1 = await h.post("/auth/refresh", { refreshToken: session.refreshToken });
    const r2 = await h.post("/auth/refresh", { refreshToken: r1.json.refreshToken });
    expect(r2.status).toBe(200);
    const replay = await h.post("/auth/refresh", { refreshToken: session.refreshToken });
    expect(replay).toMatchObject({ status: 401, json: { error: "invalid_token" } });
    expect((await h.post("/auth/refresh", { refreshToken: r2.json.refreshToken })).status).toBe(
      401,
    );
  });

  it("expires refresh tokens after 90 days and rejects unknown ones", async () => {
    const h = await harness();
    const { session } = await h.bootstrap();
    expect((await h.post("/auth/refresh", { refreshToken: "x".repeat(43) })).status).toBe(401);
    h.advance(REFRESH_TTL_MS + 1000);
    expect(await h.post("/auth/refresh", { refreshToken: session.refreshToken })).toMatchObject({
      status: 401,
      json: { error: "token_expired" },
    });
  });

  it("logout revokes only that device: its access and refresh tokens die, others keep working", async () => {
    const h = await harness();
    const { secret, session: a } = await h.bootstrap();
    const b = await h.login(secret, { deviceName: "Laptop", platform: "web" });
    expect(b.deviceId).not.toBe(a.deviceId);
    expect((await h.call("POST", "/auth/logout", undefined, h.bearer(a.accessToken))).status).toBe(
      204,
    );
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(a.accessToken))).status).toBe(401);
    expect((await h.post("/auth/refresh", { refreshToken: a.refreshToken })).status).toBe(401);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer(b.accessToken))).status).toBe(200);
    expect((await h.post("/auth/refresh", { refreshToken: b.refreshToken })).status).toBe(200);
    const rows = h.db.prepare("SELECT id, revoked_at FROM devices").all() as J[];
    expect(rows.find((r) => r.id === a.deviceId)?.revoked_at).not.toBeNull();
    expect(rows.find((r) => r.id === b.deviceId)?.revoked_at).toBeNull();
  });

  it("reuses a known deviceId on re-login but never a revoked or foreign one", async () => {
    const h = await harness();
    const { secret, session } = await h.bootstrap();
    const again = await h.login(secret, { ...h.dev, deviceId: session.deviceId });
    expect(again.deviceId).toBe(session.deviceId);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM devices").get()).toEqual({ n: 1 });
    await h.call("POST", "/auth/logout", undefined, h.bearer(again.accessToken));
    const fresh = await h.login(secret, { ...h.dev, deviceId: session.deviceId });
    expect(fresh.deviceId).not.toBe(session.deviceId);
  });
});

describe("request handling", () => {
  it("rejects missing/garbage bearer tokens, bad bodies and unknown routes; never caches", async () => {
    const h = await harness();
    expect((await h.call("GET", "/auth/me")).status).toBe(401);
    expect((await h.call("GET", "/auth/me", undefined, h.bearer("garbage"))).status).toBe(401);
    expect(
      (await h.call("GET", "/auth/me", undefined, { authorization: "Basic abc" })).status,
    ).toBe(401);
    const bad = await h.call("POST", "/auth/login", undefined);
    expect(bad).toMatchObject({ status: 400, json: { error: "invalid_request" } });
    expect((await h.post("/auth/refresh", {})).status).toBe(400);
    const nf = await h.call("GET", "/auth/nope");
    expect(nf).toMatchObject({ status: 404, json: { error: "not_found" } });
    expect(nf.headers.get("cache-control")).toBe("no-store");
  });
});
