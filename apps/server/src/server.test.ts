import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { migrate, migrations, SCHEMA_VERSION } from "@wallt/db";
import Database from "better-sqlite3";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { dbPath, openDatabase, runMigrations, toExecutor } from "./database";
import { createScheduler } from "./scheduler";

const log = pino({ level: "silent" });
const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "wallt-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("applies defaults and treats empty strings as unset", () => {
    expect(loadConfig({ APP_URL: "" })).toEqual({
      PORT: 3000,
      DATA_DIR: "/data",
      LOG_LEVEL: "info",
    });
  });
  it("validates values", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    expect(loadConfig({ PORT: "8080", APP_URL: "https://x.test", ENCRYPTION_KEY: key }).PORT).toBe(
      8080,
    );
    expect(() => loadConfig({ PORT: "0" })).toThrow(/PORT/);
    expect(() => loadConfig({ APP_URL: "nope" })).toThrow(/APP_URL/);
    expect(() => loadConfig({ ENCRYPTION_KEY: "short" })).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});

describe("database + /health", () => {
  it("starts from an empty data dir, applies migrations and serves /health over HTTP", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(await runMigrations(db, dir, log)).toEqual(migrations.map((m) => m.tag));
    expect(await runMigrations(db, dir, log)).toEqual([]);

    const server = serve({ fetch: createApp({ db, log }).fetch, port: 0 });
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", schemaVersion: SCHEMA_VERSION });
    expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
    await new Promise((r) => server.close(r));
    db.close();
  });

  it("reports 503 when the database is unavailable", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    const app = createApp({ db, log });
    db.close();
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("writes a pre-migration snapshot only when an existing DB has pending migrations", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    const first = migrations[0];
    if (!first) throw new Error("no migrations");
    await migrate(toExecutor(db), [first]);
    expect(readdirSync(dir)).not.toContain("backups");
    await runMigrations(db, dir, log);
    const snaps = readdirSync(join(dir, "backups"));
    expect(snaps).toHaveLength(1);
    const snap = new Database(join(dir, "backups", snaps[0] as string), { readonly: true });
    expect(snap.prepare("SELECT COUNT(*) AS n FROM __migrations").get()).toEqual({ n: 1 });
    snap.close();
    db.close();
    expect(dbPath(dir)).toContain("wallt.db");
  });
});

describe("scheduler", () => {
  it("records successful and failed runs in job_runs", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    await runMigrations(db, dir, log);
    const scheduler = createScheduler(db, log);
    scheduler.register({ name: "ok", schedule: "0 0 1 1 *", run: async () => ({ rows: 3 }) });
    scheduler.register({
      name: "bad",
      schedule: "0 0 1 1 *",
      run: async () => {
        throw new Error("boom");
      },
    });
    expect(() =>
      scheduler.register({ name: "ok", schedule: "0 0 1 1 *", run: async () => undefined }),
    ).toThrow();
    await scheduler.runNow("ok");
    await scheduler.runNow("bad");
    await expect(scheduler.runNow("missing")).rejects.toThrow();
    const rows = db
      .prepare("SELECT job, status, counts, error FROM job_runs ORDER BY started_at, job")
      .all();
    expect(rows).toEqual(
      expect.arrayContaining([
        { job: "ok", status: "success", counts: '{"rows":3}', error: null },
        { job: "bad", status: "failed", counts: null, error: "boom" },
      ]),
    );
    scheduler.stop();
    db.close();
  });
});
