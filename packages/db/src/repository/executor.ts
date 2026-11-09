import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { SqlExecutor } from "../migrate";
import * as schema from "../schema";

/**
 * `SqlExecutor` plus raw array rows. Drizzle maps result columns by position, so it needs `values`;
 * object rows (`all`) would collapse same-named columns. expo-sqlite: `executeForRawResultAsync`;
 * node:sqlite: `setReturnArrays(true)`; better-sqlite3: `.raw(true)`.
 */
export interface RawSqlExecutor extends SqlExecutor {
  values(sql: string, params?: readonly unknown[]): Promise<unknown[][]>;
}

/**
 * Drizzle over any async SQLite (ADR 0002 finding 3): the `sqlite-proxy` driver on top of the executor, never the
 * sync drivers (which busy-wait on web and block the UI).
 */
export function createDrizzle(exec: RawSqlExecutor) {
  return drizzle(
    async (sql, params, method) => {
      if (method === "run") {
        await exec.run(sql, params);
        return { rows: [] };
      }
      const rows = await exec.values(sql, params);
      return { rows: method === "get" ? (rows[0] as unknown[]) : rows };
    },
    { schema },
  );
}

export type WalltDb = ReturnType<typeof createDrizzle>;
