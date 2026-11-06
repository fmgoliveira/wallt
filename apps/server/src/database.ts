import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { migrate, migrations, type SqlExecutor } from "@wallt/db";
import Database from "better-sqlite3";
import type { Logger } from "./logger";

export type Db = Database.Database;

export function dbPath(dataDir: string): string {
  return join(dataDir, "wallt.db");
}

/** Opens the SQLite file under `dataDir` with WAL, foreign keys and a busy timeout. */
export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath(dataDir));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

/** Adapts better-sqlite3 to the async executor used by @wallt/db (shared with the device). */
export function toExecutor(db: Db): SqlExecutor {
  return {
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
    },
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        const out = await fn();
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function appliedTags(db: Db): Set<string> {
  const has = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__migrations'")
    .get();
  if (!has) return new Set();
  return new Set(
    (db.prepare("SELECT tag FROM __migrations").all() as { tag: string }[]).map((r) => r.tag),
  );
}

/**
 * Applies pending migrations. If the DB already has data (earlier migrations applied), a local
 * `VACUUM INTO` snapshot is written to `<dataDir>/backups` first. Returns applied tags.
 */
export async function runMigrations(db: Db, dataDir: string, log: Logger): Promise<string[]> {
  const done = appliedTags(db);
  const pending = migrations.filter((m) => !done.has(m.tag));
  if (pending.length === 0) return [];
  if (done.size > 0) {
    const dir = join(dataDir, "backups");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `pre-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    db.prepare("VACUUM INTO ?").run(file);
    log.info({ file, pending: pending.map((m) => m.tag) }, "pre-migration snapshot written");
  }
  const applied = await migrate(toExecutor(db));
  log.info({ applied }, "migrations applied");
  return applied;
}
