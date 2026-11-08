import { DatabaseSync } from "node:sqlite";
import { migrate } from "../migrate";
import type { RawSqlExecutor } from "./executor";
import { createLocalRepository } from "./local";
import { createLocalStamper } from "./stamper";
import type { Repository } from "./types";

/** In-memory SQLite (Node's built-in) as a `RawSqlExecutor`, standing in for expo-sqlite / better-sqlite3. */
export function createNodeExecutor(): { exec: RawSqlExecutor; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  let depth = 0;
  const exec: RawSqlExecutor = {
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    async values(sql, params = []) {
      const stmt = raw.prepare(sql);
      stmt.setReturnArrays(true);
      return stmt.all(...(params as never[])) as unknown as unknown[][];
    },
    async run(sql, params = []) {
      raw.prepare(sql).run(...(params as never[]));
    },
    async transaction(fn) {
      if (depth > 0) throw new Error("nested BEGIN: the repository must serialize transactions");
      depth += 1;
      raw.exec("BEGIN");
      try {
        const out = await fn();
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      } finally {
        depth -= 1;
      }
    },
  };
  return { exec, raw };
}

export async function createTestRepository(options?: { clock?: () => number }): Promise<{
  repo: Repository;
  raw: DatabaseSync;
}> {
  const { exec, raw } = createNodeExecutor();
  await migrate(exec);
  let t = Date.UTC(2026, 10, 8, 12, 0, 0);
  const stamper = createLocalStamper({
    userId: "local",
    nodeId: "test",
    clock: options?.clock ?? (() => (t += 1)),
  });
  return { repo: createLocalRepository(exec, stamper), raw };
}
