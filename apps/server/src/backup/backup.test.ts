import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, SCHEMA_VERSION } from "@wallt/db";
import * as age from "age-encryption";
import Database from "better-sqlite3";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, runMigrations, toExecutor } from "../database";
import { inspectDatabase } from "./archive";
import { restoreBackup } from "./restore";
import { backupFileName, parseBackupName, selectPrune } from "./retention";
import { createBackupService } from "./service";
import { createFsStorage } from "./storage";
import { assertSafeName, packTar, packTarGz, unpackTar, unpackTarGz } from "./tar";

const log = pino({ level: "silent" });
const dirs: string[] = [];
const dbs: { close(): void }[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "wallt-backup-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function keys() {
  const identity = await age.generateX25519Identity();
  return { identity, recipient: await age.identityToRecipient(identity) };
}

/** A migrated database with a few rows and an attachment on disk. */
async function seeded(dataDir: string) {
  const db = openDatabase(dataDir);
  dbs.push(db);
  await runMigrations(db, dataDir, log);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u1', 'a@b.c', 'h', 't', 't')",
  ).run();
  for (let i = 0; i < 25; i++) {
    db.prepare(
      "INSERT INTO tags (id, user_id, created_at, updated_at, hlc, name) VALUES (?, 'u1', 't', 't', 'h', ?)",
    ).run(`tag-${i}`, `tag ${i}`);
  }
  mkdirSync(join(dataDir, "attachments", "2026", "01"), { recursive: true });
  writeFileSync(join(dataDir, "attachments", "2026", "01", "receipt.pdf"), "PDF-BYTES");
  return db;
}

describe("tar", () => {
  it("round-trips files of any size, long paths and empty files", () => {
    const long = `attachments/${"a".repeat(80)}/${"b".repeat(60)}/file.bin`;
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    const entries = [
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "empty", data: new Uint8Array() },
      { name: "big.bin", data: big },
      { name: long, data: new Uint8Array([1, 2, 3]) },
    ];
    const out = unpackTarGz(packTarGz(entries, 1_700_000_000));
    expect(out.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    expect(out[2]?.data).toEqual(big);
    expect(new TextDecoder().decode(out[0]?.data)).toBe("hello");
  });
  it("rejects unsafe names when writing and when reading", () => {
    for (const bad of ["../x", "/etc/passwd", "a/../b", "a\\b", "", "a//b", "./x"]) {
      expect(() => assertSafeName(bad)).toThrow();
    }
    const tar = packTar([{ name: "okay.txt", data: new Uint8Array([1]) }], 0);
    tar.set(new TextEncoder().encode("../evil\0"), 0);
    const sum = tar.subarray(0, 512).reduce((a, b, i) => a + (i >= 148 && i < 156 ? 0x20 : b), 0);
    tar.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    expect(() => unpackTar(tar)).toThrow(/Unsafe/);
  });
  it("detects corruption, truncation, links and oversize archives", () => {
    const good = packTar([{ name: "a.txt", data: new Uint8Array(600).fill(7) }], 0);
    const flipped = good.slice();
    flipped[10] = (flipped[10] as number) ^ 1;
    expect(() => unpackTar(flipped)).toThrow(/checksum/);
    expect(() => unpackTar(good.slice(0, 700))).toThrow(/truncated/);
    expect(() => unpackTar(good.slice(0, 512 * 2))).toThrow();
    expect(() => unpackTar(good, 100)).toThrow(/too large/);
    const link = good.slice();
    link[156] = 0x32; // symlink
    const sum = link.subarray(0, 512).reduce((a, b, i) => a + (i >= 148 && i < 156 ? 0x20 : b), 0);
    link.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    expect(() => unpackTar(link)).toThrow(/Unsupported/);
  });
});

describe("retention (GFS)", () => {
  const at = (iso: string, trigger: "scheduled" | "manual" | "pre_migration" = "scheduled") => {
    const name = backupFileName(trigger, new Date(iso));
    return { id: `id:${name}`, name };
  };

  it("names round-trip and foreign names are ignored", () => {
    const name = backupFileName("manual", new Date("2026-03-05T03:30:00.123Z"));
    expect(name).toBe("wallt-backup-20260305T033000Z-manual.tar.gz.age");
    expect(parseBackupName(name)).toEqual({
      at: new Date("2026-03-05T03:30:00Z"),
      trigger: "manual",
    });
    expect(parseBackupName("holiday-photos.zip")).toBeNull();
    expect(parseBackupName("wallt-backup-20261301T000000Z-manual.tar.gz.age")).toBeNull();
  });

  it("keeps 14 dailies + 8 weeklies + 12 monthlies of 400 daily backups, newest of each period", () => {
    const now = new Date("2027-01-01T12:00:00Z");
    const files = Array.from({ length: 400 }, (_, i) =>
      at(new Date(now.getTime() - i * 86_400_000 - 8.5 * 3_600_000).toISOString()),
    );
    const doomed = new Set(selectPrune(files, now).map((f) => f.id));
    const kept = files.filter((f) => !doomed.has(f.id));
    expect(kept.length).toBeGreaterThanOrEqual(14);
    expect(kept.length).toBeLessThanOrEqual(34);
    const keptDays = kept
      .map((f) => parseBackupName(f.name)?.at.toISOString().slice(0, 10) as string)
      .sort()
      .reverse();
    for (let i = 0; i < 14; i++)
      expect(keptDays).toContain(
        new Date(now.getTime() - i * 86_400_000 - 8.5 * 3_600_000).toISOString().slice(0, 10),
      );
    const months = new Set(keptDays.map((d) => d.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(12);
  });

  it("keeps the newest of a period, the newest 3 overall, and recent pre-migration backups only", () => {
    const now = new Date("2026-06-30T00:00:00Z");
    const files = [
      at("2026-06-29T03:30:00Z"),
      at("2026-06-29T21:00:00Z", "manual"), // newer on the same day
      at("2026-06-20T03:30:00Z", "pre_migration"), // 10 days old: kept
      at("2026-04-01T03:30:00Z", "pre_migration"), // 90 days old: pruned
      at("2025-01-01T03:30:00Z"),
      { id: "x", name: "not-ours.txt" },
    ];
    const pruned = selectPrune(files, now, {
      daily: 1,
      weekly: 1,
      monthly: 1,
      preMigrationDays: 30,
      keepNewest: 3,
    });
    const names = pruned.map((f) => f.name);
    expect(names).toContain(files[3]?.name);
    expect(names).toContain(files[4]?.name);
    expect(names).not.toContain(files[0]?.name); // among the newest 3
    expect(names).not.toContain("not-ours.txt");
    expect(names).not.toContain(files[2]?.name);
  });

  it("never deletes anything when there are few backups, and handles empty input", () => {
    expect(selectPrune([], new Date())).toEqual([]);
    const few = [
      at("2026-01-01T00:00:00Z"),
      at("2026-01-02T00:00:00Z"),
      at("2026-01-03T00:00:00Z"),
    ];
    expect(selectPrune(few, new Date("2030-01-01"))).toEqual([]);
  });
});

describe("backup -> restore", () => {
  it("restores an identical database (row counts match) plus attachments, keeping the old data aside", async () => {
    const dataDir = tmp();
    const db = await seeded(dataDir);
    const storeDir = tmp();
    const { identity, recipient } = await keys();
    const svc = createBackupService({
      db,
      dataDir,
      log,
      recipient,
      storage: createFsStorage(storeDir),
    });

    const before = inspectDatabase(join(dataDir, "wallt.db"));
    const res = await svc.run("manual");
    expect(res.status).toBe("success");
    expect(readdirSync(dataDir).filter((n) => n.startsWith(".backup-tmp-"))).toEqual([]);

    const stored = readdirSync(storeDir);
    expect(stored).toHaveLength(1);
    const encrypted = new Uint8Array(readFileSync(join(storeDir, stored[0] as string)));
    expect(Buffer.from(encrypted).toString("latin1")).not.toContain("SQLite format");
    expect(Buffer.from(encrypted).toString("latin1")).not.toContain("PDF-BYTES");

    // simulate disaster: server stopped, data lost/changed
    db.prepare("DELETE FROM tags").run();
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    dbs.length = 0;
    rmSync(join(dataDir, "attachments"), { recursive: true });

    const out = await restoreBackup({
      encrypted,
      identity,
      dataDir,
      now: () => Date.UTC(2026, 0, 1),
    });
    expect(out.previousDir).toContain("pre-restore-2026-01-01");
    const after = inspectDatabase(join(dataDir, "wallt.db"));
    expect(after).toEqual(before);
    expect(after.tables.tags).toBe(25);
    expect(after.schemaVersion).toBe(SCHEMA_VERSION);
    expect(readFileSync(join(dataDir, "attachments", "2026", "01", "receipt.pdf"), "utf8")).toBe(
      "PDF-BYTES",
    );
    expect(inspectDatabase(join(out.previousDir as string, "wallt.db")).tables.tags).toBe(0);
    expect(readdirSync(dataDir).filter((n) => n.startsWith(".restore-"))).toEqual([]);
    const reopened = openDatabase(dataDir);
    dbs.push(reopened);
    expect(reopened.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(await runMigrations(reopened, dataDir, log)).toEqual([]);
  });

  it("refuses a wrong key, tampered data and corrupt databases without touching live data", async () => {
    const dataDir = tmp();
    const db = await seeded(dataDir);
    const storeDir = tmp();
    const { identity, recipient } = await keys();
    const svc = createBackupService({
      db,
      dataDir,
      log,
      recipient,
      storage: createFsStorage(storeDir),
    });
    await svc.run("scheduled");
    const encrypted = new Uint8Array(
      readFileSync(join(storeDir, readdirSync(storeDir)[0] as string)),
    );
    db.close();
    dbs.length = 0;
    const live = readFileSync(join(dataDir, "wallt.db"));

    await expect(
      restoreBackup({ encrypted, identity: await age.generateX25519Identity(), dataDir }),
    ).rejects.toThrow();
    const tampered = encrypted.slice();
    tampered[tampered.length - 5] = (tampered[tampered.length - 5] as number) ^ 1;
    await expect(restoreBackup({ encrypted: tampered, identity, dataDir })).rejects.toThrow();

    // a backup whose database is garbage but whose archive is otherwise valid
    const enc = new age.Encrypter();
    enc.addRecipient(recipient);
    const manifest = { version: 1, createdAt: "t", schemaVersion: 1, tables: {} };
    const bad = await enc.encrypt(
      packTarGz(
        [
          { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest)) },
          { name: "wallt.db", data: new TextEncoder().encode("this is not a database".repeat(50)) },
        ],
        0,
      ),
    );
    await expect(restoreBackup({ encrypted: bad, identity, dataDir })).rejects.toThrow();

    // newer schema than this server
    const enc2 = new age.Encrypter();
    enc2.addRecipient(recipient);
    const newer = await enc2.encrypt(
      packTarGz(
        [
          {
            name: "manifest.json",
            data: new TextEncoder().encode(
              JSON.stringify({ ...manifest, schemaVersion: SCHEMA_VERSION + 1 }),
            ),
          },
          { name: "wallt.db", data: new Uint8Array(readFileSync(join(dataDir, "wallt.db"))) },
        ],
        0,
      ),
    );
    await expect(restoreBackup({ encrypted: newer, identity, dataDir })).rejects.toThrow(/newer/);

    expect(readFileSync(join(dataDir, "wallt.db")).equals(live)).toBe(true);
    expect(
      readdirSync(dataDir).filter((n) => n.startsWith("pre-restore") || n.startsWith(".restore-")),
    ).toEqual([]);
  });

  it("detects a row-count mismatch between manifest and database", async () => {
    const dataDir = tmp();
    const db = await seeded(dataDir);
    const { identity, recipient } = await keys();
    const file = join(dataDir, "copy.db");
    db.prepare("VACUUM INTO ?").run(file);
    const info = inspectDatabase(file);
    const enc = new age.Encrypter();
    enc.addRecipient(recipient);
    const lie = await enc.encrypt(
      packTarGz(
        [
          {
            name: "manifest.json",
            data: new TextEncoder().encode(
              JSON.stringify({
                version: 1,
                createdAt: "t",
                schemaVersion: info.schemaVersion,
                tables: { ...info.tables, tags: 999 },
              }),
            ),
          },
          { name: "wallt.db", data: new Uint8Array(readFileSync(file)) },
        ],
        0,
      ),
    );
    await expect(restoreBackup({ encrypted: lie, identity, dataDir })).rejects.toThrow(
      /Row count mismatch in tags/,
    );
  });

  it("restores into an empty data directory (disaster recovery on a new server)", async () => {
    const src = tmp();
    const db = await seeded(src);
    const storeDir = tmp();
    const { identity, recipient } = await keys();
    await createBackupService({
      db,
      dataDir: src,
      log,
      recipient,
      storage: createFsStorage(storeDir),
    }).run("manual");
    const encrypted = new Uint8Array(
      readFileSync(join(storeDir, readdirSync(storeDir)[0] as string)),
    );
    const fresh = join(tmp(), "new-data");
    const out = await restoreBackup({ encrypted, identity, dataDir: fresh });
    expect(out.previousDir).toBeNull();
    expect(inspectDatabase(join(fresh, "wallt.db")).tables.tags).toBe(25);
    expect(existsSync(join(fresh, "attachments", "2026", "01", "receipt.pdf"))).toBe(true);
  });
});

describe("backup service", () => {
  it("records failures, never prunes on failure, and recovers on the next run", async () => {
    const dataDir = tmp();
    const db = await seeded(dataDir);
    const { recipient } = await keys();
    const real = createFsStorage(tmp());
    let failUpload = true;
    const deleted: string[] = [];
    const storage = {
      ...real,
      async upload(name: string, bytes: Uint8Array) {
        if (failUpload) throw new Error("drive unavailable");
        return real.upload(name, bytes);
      },
      async delete(id: string) {
        deleted.push(id);
        return real.delete(id);
      },
    };
    const svc = createBackupService({ db, dataDir, log, recipient, storage });
    const failed = await svc.run("scheduled");
    expect(failed).toMatchObject({ status: "failed", error: "drive unavailable" });
    expect(deleted).toEqual([]);
    failUpload = false;
    expect((await svc.run("scheduled")).status).toBe("success");
    const runs = svc.recentRuns();
    expect(runs.map((r) => r.status)).toEqual(["success", "failed"]);
    expect(runs[1]?.error).toBe("drive unavailable");
    expect(runs[0]?.sizeBytes).toBeGreaterThan(0);
    expect(readdirSync(dataDir).filter((n) => n.startsWith(".backup-tmp-"))).toEqual([]);
  });

  it("does not run two backups at once, and a pruning failure does not fail the backup", async () => {
    const dataDir = tmp();
    const db = await seeded(dataDir);
    const { recipient } = await keys();
    const real = createFsStorage(tmp());
    const svc = createBackupService({
      db,
      dataDir,
      log,
      recipient,
      storage: {
        ...real,
        list: async () => {
          throw new Error("list failed");
        },
      },
    });
    const [a, b] = await Promise.all([svc.run("manual"), svc.run("manual")]);
    expect([a.status, b.status].sort()).toEqual(["busy", "success"]);
  });

  it("backs up a given database file (the pre-migration snapshot) with its own schema version", async () => {
    const dataDir = tmp();
    const db = openDatabase(dataDir);
    dbs.push(db);
    await runMigrations(db, dataDir, log);
    const old = join(dataDir, "old.db");
    const oldDb = new Database(old);
    await migrate(toExecutor(oldDb as never), [
      { tag: "0000_init", statements: ["CREATE TABLE t (a)"] },
    ]);
    oldDb.close();
    const { identity, recipient } = await keys();
    const storeDir = tmp();
    await createBackupService({
      db,
      dataDir,
      log,
      recipient,
      storage: createFsStorage(storeDir),
    }).run("pre_migration", { dbFile: old });
    const dec = new age.Decrypter();
    dec.addIdentity(identity);
    const entries = unpackTarGz(
      await dec.decrypt(
        new Uint8Array(readFileSync(join(storeDir, readdirSync(storeDir)[0] as string))),
      ),
    );
    const manifest = JSON.parse(
      new TextDecoder().decode(entries.find((e) => e.name === "manifest.json")?.data),
    );
    expect(manifest).toMatchObject({ version: 1, schemaVersion: 1, tables: { t: 0 } });
  });
});
