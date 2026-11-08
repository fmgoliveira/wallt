import {
  createLocalRepository,
  createLocalStamper,
  migrate,
  type RawSqlExecutor,
  type Repository,
  seedDefaultCategories,
} from "@wallt/db";
import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

/** Local user until sign-in exists (P3 re-stamps rows to the server user; see ADR 0005). */
export const LOCAL_USER_ID = "local";

/**
 * expo-sqlite (async API only, ADR 0002) as the executor `@wallt/db` expects. Shared by Android (native SQLite)
 * and web (interim: wa-sqlite WASM + OPFS, data stays in this browser; ADR 0005).
 */
async function toExecutor(db: SQLiteDatabase): Promise<RawSqlExecutor> {
  // WAL on native; the web VFS (OPFS access handles) does not support it.
  if (Platform.OS !== "web") await db.execAsync("PRAGMA journal_mode = WAL;");
  return {
    all: <T>(sql: string, params: readonly unknown[] = []) =>
      db.getAllAsync<T>(sql, params as SQLiteBindParams),
    async values(sql, params = []) {
      const statement = await db.prepareAsync(sql);
      try {
        const result = await statement.executeForRawResultAsync(params as SQLiteBindParams);
        return (await result.getAllAsync()) as unknown[][];
      } finally {
        await statement.finalizeAsync();
      }
    },
    async run(sql, params = []) {
      await db.runAsync(sql, params as SQLiteBindParams);
    },
    // One connection; the repository serializes callers, so a plain BEGIN/COMMIT is safe here.
    async transaction(fn) {
      await db.execAsync("BEGIN");
      try {
        const out = await fn();
        await db.execAsync("COMMIT");
        return out;
      } catch (error) {
        await db.execAsync("ROLLBACK");
        throw error;
      }
    },
  };
}

/** Applies pending migrations, seeds default categories, returns the repository over `db`. */
export async function repositoryFromDatabase(db: SQLiteDatabase): Promise<Repository> {
  const exec = await toExecutor(db);
  await migrate(exec);
  const stamper = createLocalStamper({ userId: LOCAL_USER_ID, nodeId: Platform.OS });
  await seedDefaultCategories(exec, {
    userId: stamper.userId,
    newId: stamper.newId,
    now: stamper.now(),
    hlc: stamper.hlc(),
  });
  return createLocalRepository(exec, stamper);
}
