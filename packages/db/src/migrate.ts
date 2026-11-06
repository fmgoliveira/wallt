import { migrations as bundled } from "./migrations.generated";

/**
 * Minimal async SQL surface so one runner works on expo-sqlite (async API only, see ADR 0002)
 * and on better-sqlite3 (wrap its sync calls). No Drizzle sync driver involved.
 */
export interface SqlExecutor {
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export type Migration = { tag: string; statements: readonly string[] };

/** Number of bundled migrations; sent as `schemaVersion` by the sync API. */
export const SCHEMA_VERSION = bundled.length;

/** Applies pending migrations in order, each in its own transaction. Returns the applied tags. */
export async function migrate(
  db: SqlExecutor,
  migrations: readonly Migration[] = bundled,
  now: () => string = () => new Date().toISOString(),
): Promise<string[]> {
  await db.run(
    "CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)",
  );
  const done = new Set(
    (await db.all<{ tag: string }>("SELECT tag FROM __migrations")).map((r) => r.tag),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.tag)) continue;
    await db.transaction(async () => {
      for (const stmt of m.statements) await db.run(stmt);
      await db.run("INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)", [m.tag, now()]);
    });
    applied.push(m.tag);
  }
  return applied;
}
