import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMA_VERSION } from "@wallt/db";
import * as age from "age-encryption";
import Database from "better-sqlite3";
import {
  ATTACHMENTS_DIR,
  DB_ENTRY,
  inspectDatabase,
  MANIFEST_ENTRY,
  type Manifest,
} from "./archive";
import { unpackTarGz } from "./tar";

export type RestoreResult = {
  manifest: Manifest;
  /** Where the previous database/attachments were moved (null if there was nothing to move). */
  previousDir: string | null;
};

/**
 * Decrypts a backup and swaps it in for the live data. The server MUST be stopped. Order of safety:
 * decrypt -> unpack -> verify (manifest, schema version, `PRAGMA integrity_check`, row counts) in a
 * staging directory; only then are the current files moved aside (never deleted) and the new ones moved in,
 * with a rollback if a move fails.
 */
export async function restoreBackup(opts: {
  encrypted: Uint8Array;
  /** age identity (`AGE-SECRET-KEY-1...`). */
  identity: string;
  dataDir: string;
  now?: () => number;
}): Promise<RestoreResult> {
  const { dataDir } = opts;
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(opts.identity);
  const entries = unpackTarGz(await decrypter.decrypt(opts.encrypted));

  const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY);
  const dbEntry = entries.find((e) => e.name === DB_ENTRY);
  if (!manifestEntry || !dbEntry) throw new Error("Backup is missing its manifest or database");
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as Manifest;
  if (manifest.version !== 1) throw new Error(`Unsupported backup version: ${manifest.version}`);
  if (manifest.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Backup has schema version ${manifest.schemaVersion}, newer than this server (${SCHEMA_VERSION}); upgrade first`,
    );
  }

  mkdirSync(dataDir, { recursive: true });
  const staging = mkdtempSync(join(dataDir, ".restore-"));
  try {
    const stagedDb = join(staging, DB_ENTRY);
    writeFileSync(stagedDb, dbEntry.data);
    const check = new Database(stagedDb, { readonly: true });
    try {
      const result = check.pragma("integrity_check", { simple: true });
      if (result !== "ok")
        throw new Error(`Restored database failed integrity_check: ${String(result)}`);
    } finally {
      check.close();
    }
    const actual = inspectDatabase(stagedDb).tables;
    for (const [table, count] of Object.entries(manifest.tables)) {
      if (actual[table] !== count) {
        throw new Error(
          `Row count mismatch in ${table}: backup has ${count}, restored ${actual[table] ?? "none"}`,
        );
      }
    }
    for (const e of entries) {
      if (!e.name.startsWith(`${ATTACHMENTS_DIR}/`)) continue;
      const target = join(staging, e.name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, e.data);
    }

    // Swap: move the current files aside, then move the verified ones in.
    const stamp = new Date((opts.now ?? Date.now)()).toISOString().replace(/[:.]/g, "-");
    const previousDir = join(dataDir, `pre-restore-${stamp}`);
    const live = [DB_ENTRY, `${DB_ENTRY}-wal`, `${DB_ENTRY}-shm`, ATTACHMENTS_DIR].filter((n) =>
      existsSync(join(dataDir, n)),
    );
    const moved: string[] = [];
    try {
      if (live.length > 0) mkdirSync(previousDir);
      for (const n of live) {
        renameSync(join(dataDir, n), join(previousDir, n));
        moved.push(n);
      }
      renameSync(stagedDb, join(dataDir, DB_ENTRY));
      if (existsSync(join(staging, ATTACHMENTS_DIR))) {
        renameSync(join(staging, ATTACHMENTS_DIR), join(dataDir, ATTACHMENTS_DIR));
      }
    } catch (err) {
      for (const n of moved) {
        rmSync(join(dataDir, n), { recursive: true, force: true });
        renameSync(join(previousDir, n), join(dataDir, n));
      }
      throw err;
    }
    return { manifest, previousDir: live.length > 0 ? previousDir : null };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
