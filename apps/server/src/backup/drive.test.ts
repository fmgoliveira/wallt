import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, migrations } from "@wallt/db";
import * as age from "age-encryption";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { deriveKeys } from "../auth/crypto";
import type { Config } from "../config";
import { loadConfig } from "../config";
import { openDatabase, runMigrations, toExecutor } from "../database";
import { createScheduler } from "../scheduler";
import { inspectDatabase } from "./archive";
import { downloadBackup } from "./download";
import { createFakeGoogle } from "./fake-google";
import {
  createDriveStorage,
  createSecretStore,
  DriveAuthError,
  pollDeviceFlow,
  startDeviceFlow,
} from "./google";
import { restoreBackup } from "./restore";
import { backupFileName } from "./retention";
import { createBackupService } from "./service";
import { configureBackups } from "./setup";
import { createFsStorage } from "./storage";

const log = pino({ level: "silent" });
const google = { clientId: "client-id", clientSecret: "client-secret" };
const KEY = Buffer.alloc(32, 5).toString("base64");
const keys = deriveKeys(KEY);
const dirs: string[] = [];
const dbs: { close(): void }[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "wallt-drive-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function linked(fake = createFakeGoogle()) {
  const dir = tmp();
  const secrets = createSecretStore(dir, keys.encKey);
  secrets.write({ refreshToken: fake.state.refreshToken });
  const storage = createDriveStorage({ google, secrets, fetch: fake.fetch });
  return { fake, dir, secrets, storage };
}

describe("OAuth device flow", () => {
  it("waits through authorization_pending and slow_down, then returns the refresh token", async () => {
    const fake = createFakeGoogle({ pendingPolls: 2, slowDown: true });
    const device = await startDeviceFlow(google, fake.fetch);
    expect(device).toMatchObject({
      userCode: "ABCD-EFGH",
      verificationUrl: "https://www.google.com/device",
      interval: 5,
    });
    const sleeps: number[] = [];
    const out = await pollDeviceFlow(google, device, {
      fetch: fake.fetch,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(out.refreshToken).toBe(fake.state.refreshToken);
    expect(sleeps).toEqual([5000, 10000, 10000, 10000]); // slow_down adds 5 s
  });
  it("fails when the user denies, and when the code expires", async () => {
    const denied = createFakeGoogle();
    denied.state.denied = true;
    const d = await startDeviceFlow(google, denied.fetch);
    await expect(
      pollDeviceFlow(google, d, { fetch: denied.fetch, sleep: async () => {} }),
    ).rejects.toThrow(/access_denied/);
    const slow = createFakeGoogle({ pendingPolls: 1000 });
    let t = 0;
    await expect(
      pollDeviceFlow(
        google,
        { ...d, expiresIn: 20 },
        {
          fetch: slow.fetch,
          sleep: async (ms) => {
            t += ms;
          },
          now: () => t,
        },
      ),
    ).rejects.toThrow(/timed out/);
  });
});

describe("encrypted token store", () => {
  it("keeps the refresh token encrypted at rest and unreadable with another key", () => {
    const dir = tmp();
    const store = createSecretStore(dir, keys.encKey);
    expect(store.read()).toBeNull();
    store.write({ refreshToken: "super-secret-refresh-token", folderId: "f1" });
    const raw = readFileSync(join(dir, "secrets", "gdrive.enc"), "utf8");
    expect(raw).toMatch(/^v1\./);
    expect(raw).not.toContain("super-secret-refresh-token");
    expect(store.read()).toEqual({ refreshToken: "super-secret-refresh-token", folderId: "f1" });
    expect(() =>
      createSecretStore(dir, deriveKeys(Buffer.alloc(32, 9).toString("base64")).encKey).read(),
    ).toThrow();
  });
});

describe("Drive storage", () => {
  it("creates the folder once, round-trips binary files, lists, downloads and deletes", async () => {
    const { fake, secrets, storage } = await linked();
    const bytes = new Uint8Array(1_000_000).map((_, i) => (i * 31) % 256);
    const { id } = await storage.upload("one.bin", bytes);
    await storage.upload("two.bin", new Uint8Array([1, 2, 3]));
    expect(fake.state.folders.size).toBe(1);
    expect(secrets.read()?.folderId).toBe([...fake.state.folders.keys()][0]);
    expect((await storage.list()).map((f) => f.name).sort()).toEqual(["one.bin", "two.bin"]);
    expect((await storage.list()).find((f) => f.id === id)?.sizeBytes).toBe(1_000_000);
    expect(await storage.download(id)).toEqual(bytes);
    await storage.delete(id);
    await storage.delete(id); // already gone: not an error
    expect((await storage.list()).map((f) => f.name)).toEqual(["two.bin"]);
  });

  it("reuses an existing folder instead of creating a second one", async () => {
    const { fake, secrets, storage } = await linked();
    await storage.upload("a", new Uint8Array([1]));
    secrets.write({ refreshToken: fake.state.refreshToken }); // forget the cached folder id
    await storage.upload("b", new Uint8Array([2]));
    expect(fake.state.folders.size).toBe(1);
    expect((await storage.list()).length).toBe(2);
  });

  it("recreates the backup folder when it was deleted or trashed in Drive", async () => {
    for (const how of ["deleteFolder", "trashFolder"] as const) {
      const { fake, secrets, storage } = await linked();
      await storage.upload("before", new Uint8Array([1]));
      const oldFolder = secrets.read()?.folderId as string;
      fake[how](oldFolder);

      await storage.upload("after", new Uint8Array([2])); // 404 on the cached folder -> new folder, retried
      const newFolder = secrets.read()?.folderId as string;
      expect(newFolder).not.toBe(oldFolder);
      expect((await storage.list()).map((f) => f.name)).toEqual(["after"]);
      expect(fake.state.folders.size).toBe(how === "deleteFolder" ? 1 : 2);
    }
  });

  it("re-checks a cached folder id only once per process, and recreates a deleted folder on the next start", async () => {
    const { fake, secrets, storage } = await linked();
    await storage.upload("a", new Uint8Array([1]));
    const calls = () => fake.state.log.filter((l) => l.includes("/drive/v3/files/")).length;
    const before = calls();
    await storage.upload("b", new Uint8Array([2]));
    await storage.list();
    expect(calls()).toBe(before); // no extra folder checks while the folder is known good

    // new process (fresh client) with a cached id whose folder was trashed meanwhile
    const folder = secrets.read()?.folderId as string;
    fake.trashFolder(folder);
    const restarted = createDriveStorage({ google, secrets, fetch: fake.fetch });
    expect(await restarted.list()).toEqual([]);
    expect(secrets.read()?.folderId).not.toBe(folder);
  });

  it("follows pagination", async () => {
    const { storage } = await linked(createFakeGoogle({ pageSize: 2 }));
    for (let i = 0; i < 5; i++) await storage.upload(`f${i}`, new Uint8Array([i]));
    expect((await storage.list()).map((f) => f.name).sort()).toEqual([
      "f0",
      "f1",
      "f2",
      "f3",
      "f4",
    ]);
  });

  it("caches the access token and silently refreshes when Google rejects it", async () => {
    const { fake, storage } = await linked();
    await storage.upload("a", new Uint8Array([1]));
    await storage.list();
    expect(fake.state.tokenRequests).toBe(1); // one refresh served all calls
    fake.expireAccessTokens();
    expect((await storage.list()).length).toBe(1);
    expect(fake.state.tokenRequests).toBe(2);
  });

  it("reports an unlinked account and a revoked refresh token as DriveAuthError without leaking secrets", async () => {
    const unlinked = createDriveStorage({
      google,
      secrets: createSecretStore(tmp(), keys.encKey),
      fetch: createFakeGoogle().fetch,
    });
    await expect(unlinked.list()).rejects.toThrow(DriveAuthError);
    const { fake, storage } = await linked();
    fake.state.revoked = true;
    const err = await storage.list().catch((e: Error) => e);
    expect(err).toBeInstanceOf(DriveAuthError);
    expect((err as Error).message).toMatch(/run drive-auth again/);
    expect((err as Error).message).not.toContain(fake.state.refreshToken);
    expect((err as Error).message).not.toContain(google.clientSecret);
  });
});

describe("downloadBackup", () => {
  it("picks the newest of our files for `latest`, an explicit id, and fails clearly otherwise", async () => {
    const storage = createFsStorage(tmp());
    expect((await storage.upload("holiday.zip", new Uint8Array([9]))).id).toBeTruthy();
    await expect(downloadBackup(storage, "latest")).rejects.toThrow(/No backups found/);
    const old = await storage.upload(
      backupFileName("scheduled", new Date("2026-01-01T03:30:00Z")),
      new Uint8Array([1]),
    );
    await storage.upload(
      backupFileName("scheduled", new Date("2026-03-01T03:30:00Z")),
      new Uint8Array([3]),
    );
    await storage.upload(
      backupFileName("manual", new Date("2026-02-01T03:30:00Z")),
      new Uint8Array([2]),
    );
    expect((await downloadBackup(storage, "latest")).bytes).toEqual(new Uint8Array([3]));
    expect((await downloadBackup(storage, old.id)).bytes).toEqual(new Uint8Array([1]));
    await expect(downloadBackup(storage, "nope")).rejects.toThrow(/No backup with id nope/);
  });
});

describe("backup to Drive -> restore from Drive", () => {
  it("round-trips through the Drive client with identical row counts", async () => {
    const dataDir = tmp();
    const db = openDatabase(dataDir);
    dbs.push(db);
    await runMigrations(db, dataDir, log);
    for (let i = 0; i < 12; i++) {
      db.prepare(
        "INSERT INTO tags (id, user_id, created_at, updated_at, hlc, name) VALUES (?, 'u1', 't', 't', 'h', ?)",
      ).run(`t${i}`, `tag ${i}`);
    }
    const identity = await age.generateX25519Identity();
    const { storage, fake } = await linked();
    const svc = createBackupService({
      db,
      dataDir,
      log,
      recipient: await age.identityToRecipient(identity),
      storage,
    });
    const before = inspectDatabase(join(dataDir, "wallt.db"));
    expect((await svc.run("scheduled")).status).toBe("success");
    const [stored] = [...fake.state.files.values()];
    expect(Buffer.from(stored?.bytes ?? []).toString("latin1")).not.toContain("SQLite format"); // encrypted before upload

    db.close();
    dbs.length = 0;
    const target = join(tmp(), "restored");
    const { bytes } = await downloadBackup(storage, "latest");
    await restoreBackup({ encrypted: bytes, identity, dataDir: target });
    expect(inspectDatabase(join(target, "wallt.db"))).toEqual(before);
  });
});

describe("configureBackups (scheduler job + wiring)", () => {
  const base = {
    PORT: 3000,
    DATA_DIR: "/x",
    LOG_LEVEL: "silent",
    TRUSTED_PROXIES: "127.0.0.1",
    ENCRYPTION_KEY: KEY,
  } as Config;

  it("is disabled (null) until the recipient and the Google client are configured", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    dbs.push(db);
    const scheduler = createScheduler(db, log);
    expect(
      configureBackups({ config: { ...base, DATA_DIR: dir }, db, log, keys, scheduler }),
    ).toBeNull();
    expect(
      configureBackups({
        config: { ...base, DATA_DIR: dir, GDRIVE_CLIENT_ID: "a" },
        db,
        log,
        keys,
        scheduler,
      }),
    ).toBeNull();
    await expect(scheduler.runNow("backup")).rejects.toThrow(/Unknown job/);
  });

  it("registers the daily job; runs are recorded in job_runs and failures surface the reason", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    dbs.push(db);
    await runMigrations(db, dir, log);
    const identity = await age.generateX25519Identity();
    const config = {
      ...base,
      DATA_DIR: dir,
      BACKUP_AGE_RECIPIENT: await age.identityToRecipient(identity),
      GDRIVE_CLIENT_ID: google.clientId,
      GDRIVE_CLIENT_SECRET: google.clientSecret,
    } as Config;
    const fake = createFakeGoogle();
    const scheduler = createScheduler(db, log);
    const service = configureBackups({ config, db, log, keys, scheduler, fetch: fake.fetch });
    expect(service).not.toBeNull();

    await scheduler.runNow("backup"); // not linked yet
    createSecretStore(dir, keys.encKey).write({ refreshToken: fake.state.refreshToken });
    await scheduler.runNow("backup");
    const jobs = db
      .prepare(
        "SELECT status, counts, error FROM job_runs WHERE job = 'backup' ORDER BY started_at, id",
      )
      .all() as {
      status: string;
      counts: string | null;
      error: string | null;
    }[];
    expect(jobs.map((j) => j.status)).toEqual(["failed", "success"]);
    expect(jobs[0]?.error).toMatch(/run drive-auth/);
    expect(JSON.parse(jobs[1]?.counts ?? "{}")).toMatchObject({ pruned: 0 });
    expect(service?.recentRuns().map((r) => r.status)).toEqual(["success", "failed"]);
    scheduler.stop();
  });
});

describe("config", () => {
  it("validates the age recipient and accepts post-quantum hybrid recipients", async () => {
    const env = { ENCRYPTION_KEY: KEY };
    const recipient = await age.identityToRecipient(await age.generateX25519Identity());
    expect(loadConfig({ ...env, BACKUP_AGE_RECIPIENT: recipient }).BACKUP_AGE_RECIPIENT).toBe(
      recipient,
    );
    const hybrid = await age.identityToRecipient(await age.generateHybridIdentity());
    expect(loadConfig({ ...env, BACKUP_AGE_RECIPIENT: hybrid }).BACKUP_AGE_RECIPIENT).toBe(hybrid);
    expect(() => loadConfig({ ...env, BACKUP_AGE_RECIPIENT: "AGE-SECRET-KEY-1ABC" })).toThrow(
      /BACKUP_AGE_RECIPIENT/,
    );
    expect(() => loadConfig({ ...env, BACKUP_AGE_RECIPIENT: "not a key" })).toThrow(
      /BACKUP_AGE_RECIPIENT/,
    );
  });
});

describe("pre-migration snapshot hook", () => {
  it("reports the snapshot path only when an existing database had pending migrations", async () => {
    const dir = tmp();
    const db = openDatabase(dir);
    dbs.push(db);
    const seen: string[] = [];
    await runMigrations(db, dir, log, (f) => seen.push(f)); // fresh database: nothing to protect
    expect(seen).toEqual([]);
    expect(await runMigrations(db, dir, log, (f) => seen.push(f))).toEqual([]); // nothing pending
    expect(seen).toEqual([]);

    const older = tmp();
    const oldDb = openDatabase(older);
    dbs.push(oldDb);
    const [first] = migrations;
    if (!first) throw new Error("no migrations");
    await migrate(toExecutor(oldDb), [first]); // an install that is one migration behind
    await runMigrations(oldDb, older, log, (f) => seen.push(f));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("pre-migration-");
  });
});
