import {
  createLocalRepository,
  createLocalStamper,
  migrate,
  type RawSqlExecutor,
  type Repository,
  seedDefaultCategories,
} from "@wallt/db";
import { openDatabaseAsync, type SQLiteBindParams } from "expo-sqlite";
import { Platform } from "react-native";

/** Local user until sign-in exists (P3 re-stamps rows to the server user; see ADR 0005). */
export const LOCAL_USER_ID = "local";

const DB_NAME = "wallt.db";

/**
 * expo-sqlite (async API only, ADR 0002) as the executor `@wallt/db` expects. Same code on Android (native SQLite)
 * and, as an interim, on web (wa-sqlite WASM + OPFS; ADR 0002 amendment). Web data lives in this browser only.
 */
async function openExecutor(): Promise<RawSqlExecutor> {
  const db = await openDatabaseAsync(DB_NAME);
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

/** Opens the local database (device, or this browser on web), applies pending migrations, seeds default categories, returns the repository. */
export async function openRepository(): Promise<Repository> {
  const exec = await openExecutor();
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
