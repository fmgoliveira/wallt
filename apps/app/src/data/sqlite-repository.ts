import {
  createLocalRepository,
  createLocalStamper,
  createSyncStore,
  createUuidV7Generator,
  migrate,
  type RawSqlExecutor,
  type Repository,
  seedDefaultCategories,
} from "@wallt/db";
import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { registerSyncRuntime } from "../sync/runtime";

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

const NODE_ID_KEY = "node_id";

/** Stable per-install id: the node part of every clock value and the device id sent to the server. */
async function installId(exec: RawSqlExecutor): Promise<string> {
  const rows = await exec.all<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [
    NODE_ID_KEY,
  ]);
  const existing = rows[0]?.value;
  if (existing) return existing;
  const id = createUuidV7Generator()();
  await exec.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [NODE_ID_KEY, id]);
  return id;
}

/** Applies pending migrations, seeds default categories, returns the repository over `db`. */
export async function repositoryFromDatabase(db: SQLiteDatabase): Promise<Repository> {
  const exec = await toExecutor(db);
  await migrate(exec);
  const nodeId = await installId(exec);
  // the clock must never go backwards across restarts: start from the highest value already stored
  const initialHlc = await createSyncStore(exec, (fn) => fn()).maxHlc();
  const stamper = createLocalStamper({
    userId: LOCAL_USER_ID,
    nodeId,
    ...(initialHlc ? { initialHlc } : {}),
  });
  // After sign-in the rows belong to the server user, not `local`. Seeding as `local` would insert a fresh copy
  // of every default (including ones the user deleted); dedupe then keeps that live copy, resurrecting them.
  const owner = (
    await exec.all<{ user_id: string }>(
      "SELECT user_id FROM categories WHERE system_key IS NOT NULL LIMIT 1",
    )
  )[0]?.user_id;
  await seedDefaultCategories(exec, {
    userId: owner ?? stamper.userId,
    newId: stamper.newId,
    now: stamper.now(),
    hlc: stamper.hlc(),
  });
  const repository = createLocalRepository(exec, stamper);
  registerSyncRuntime({
    store: repository.sync,
    clock: stamper.clock,
    fx: repository.fx,
    deviceId: nodeId,
    setUserId: stamper.setUserId,
  });
  return repository;
}
