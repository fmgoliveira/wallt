import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, vi } from "vitest";
import { createApp } from "../app";
import type { BackupService } from "../backup/service";
import { openDatabase, runMigrations } from "../database";
import { createFileStore } from "../files/store";
import type { FxService } from "../fx/service";
import type { MlService } from "../ml/service";
import { deriveKeys } from "./crypto";
import { createAuthService } from "./service";
import { generateTotp } from "./totp";

// Shared by the auth test files. Argon2 makes each login slow, so allow generous timeouts.
vi.setConfig({ testTimeout: 30_000 });

// biome-ignore lint/suspicious/noExplicitAny: JSON test payloads
export type J = Record<string, any>;

const log = pino({ level: "silent" });
const KEY = Buffer.alloc(32, 7).toString("base64");
export const SETUP = "setup-token-0123456789";
export const EMAIL = "owner@example.com";
export const PASSWORD = "correct horse battery staple";

const dirs: string[] = [];
const dbs: { close(): void }[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close(); // Windows cannot delete open SQLite files
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export async function harness(
  opts: {
    setupToken?: string | undefined;
    /** Builds the backup service for /backups (receives the harness db and data dir). */
    backup?: (db: ReturnType<typeof openDatabase>, dir: string) => BackupService | null;
    /** Builds the FX service for /fx (receives the harness db). */
    fx?: (db: ReturnType<typeof openDatabase>) => FxService;
    /** Builds the ML service for /ml (receives the harness db). */
    ml?: (db: ReturnType<typeof openDatabase>) => MlService;
  } = { setupToken: SETUP },
) {
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
    // Setup is enabled by default; pass `setupToken: undefined` explicitly to disable it.
    setupToken: "setupToken" in opts ? opts.setupToken : SETUP,
    now,
  });
  const app = createApp({
    db,
    log,
    auth,
    files: createFileStore(dir),
    clock: now,
    ...(opts.backup ? { backup: opts.backup(db, dir) } : {}),
    ...(opts.fx ? { fx: opts.fx(db) } : {}),
    ...(opts.ml ? { ml: opts.ml(db) } : {}),
  });
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
    dir,
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
