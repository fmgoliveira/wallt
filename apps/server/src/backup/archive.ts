import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import * as age from "age-encryption";
import Database from "better-sqlite3";
import type { Db } from "../database";
import { packTarGz, type TarEntry } from "./tar";

export const DB_ENTRY = "wallt.db";
export const MANIFEST_ENTRY = "manifest.json";
export const ATTACHMENTS_DIR = "attachments";

export type Manifest = {
  version: 1;
  createdAt: string;
  /** Number of applied migrations in the snapshot (compare with SCHEMA_VERSION on restore). */
  schemaVersion: number;
  /** Row count per table, re-checked after restore. */
  tables: Record<string, number>;
};

const quote = (id: string) => `"${id.replaceAll('"', '""')}"`;

/** Table row counts of a SQLite file (opened read-only) plus its schema version. */
export function inspectDatabase(file: string): {
  schemaVersion: number;
  tables: Record<string, number>;
} {
  const db = new Database(file, { readonly: true });
  try {
    const names = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    const tables: Record<string, number> = {};
    for (const name of names) {
      tables[name] = (
        db.prepare(`SELECT COUNT(*) AS n FROM ${quote(name)}`).get() as { n: number }
      ).n;
    }
    return { schemaVersion: tables.__migrations ?? 0, tables };
  } finally {
    db.close();
  }
}

/** Consistent online snapshot of the live database (`VACUUM INTO`) into `dest`. */
export function snapshotDatabase(db: Db, dest: string): void {
  db.prepare("VACUUM INTO ?").run(dest);
}

function walk(dir: string, base: string, out: TarEntry[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile()) {
      out.push({
        name: `${ATTACHMENTS_DIR}/${relative(base, full).split(sep).join("/")}`,
        data: new Uint8Array(readFileSync(full)),
      });
    }
  }
}

/** Reads `<dataDir>/attachments` (if any) as archive entries. */
export function collectAttachments(dataDir: string): TarEntry[] {
  const dir = join(dataDir, ATTACHMENTS_DIR);
  const out: TarEntry[] = [];
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir, dir, out);
  return out;
}

/**
 * Builds the encrypted backup: SQLite file + attachments + manifest, tar.gz'd, then encrypted with `age`
 * for `recipient` (public key; the matching identity never lives on the server).
 */
export async function buildEncryptedArchive(opts: {
  dbFile: string;
  dataDir: string;
  recipient: string;
  now: Date;
}): Promise<{ bytes: Uint8Array; manifest: Manifest }> {
  const { schemaVersion, tables } = inspectDatabase(opts.dbFile);
  const manifest: Manifest = {
    version: 1,
    createdAt: opts.now.toISOString(),
    schemaVersion,
    tables,
  };
  const entries: TarEntry[] = [
    { name: MANIFEST_ENTRY, data: new TextEncoder().encode(JSON.stringify(manifest)) },
    { name: DB_ENTRY, data: new Uint8Array(readFileSync(opts.dbFile)) },
    ...collectAttachments(opts.dataDir),
  ];
  const encrypter = new age.Encrypter();
  encrypter.addRecipient(opts.recipient);
  const bytes = await encrypter.encrypt(packTarGz(entries, Math.floor(opts.now.getTime() / 1000)));
  return { bytes, manifest };
}

/** Temp directory inside the data volume (the container root filesystem is read-only). */
export function makeTempDir(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true });
  return mkdtempSync(join(dataDir, ".backup-tmp-"));
}

export const removeDir = (dir: string) => rmSync(dir, { recursive: true, force: true });
