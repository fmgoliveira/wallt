import {
  type Change,
  isSyncTable,
  MAX_PUSH_ATTEMPTS,
  type OutboxCounts,
  type PulledRow,
  type PushResponse,
  resolveConflict,
  SYNC_TABLES,
  type SyncRow,
  type SyncStorePort,
  type SyncTable,
} from "@wallt/sync";
import { OUTBOX_SUSPENDED_KEY } from "../outbox-triggers";
import type { RawSqlExecutor } from "../repository/executor";
import { syncColumns, upsertParams, upsertSql } from "./tables";

const CURSOR_KEY = "pull_cursor";
/** Owner of rows written before any sign-in (ADR 0005). */
const LOCAL_USER_ID = "local";

/** Local sync operations on the device database. Beyond the engine's port: `enroll` (first sign-in). */
export interface SyncStore extends SyncStorePort {
  /**
   * Re-stamps every row with the server user id (ADR 0005 / 0007) and queues all of them for the first push.
   * Returns the number of rows touched. Rows that already carry `userId` are left alone.
   */
  enroll(userId: string): Promise<number>;
}

/** Serializes work on the shared connection; the repository's queue, so sync never interleaves with a write. */
export type Exclusive = <T>(fn: () => Promise<T>) => Promise<T>;

const q = (name: string) => `"${name}"`;

export function createSyncStore(exec: RawSqlExecutor, exclusive: Exclusive): SyncStore {
  const atomic = <T>(fn: () => Promise<T>) => exclusive(() => exec.transaction(fn));

  const suspend = () =>
    exec.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, '1')", [
      OUTBOX_SUSPENDED_KEY,
    ]);
  const resume = () => exec.run("DELETE FROM sync_meta WHERE key = ?", [OUTBOX_SUSPENDED_KEY]);

  async function readMeta(key: string): Promise<string | null> {
    const rows = await exec.all<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [
      key,
    ]);
    return rows[0]?.value ?? null;
  }

  async function readRow(table: SyncTable, id: string): Promise<SyncRow | null> {
    const rows = await exec.all<SyncRow>(`SELECT * FROM ${q(table)} WHERE id = ?`, [id]);
    return rows[0] ?? null;
  }

  async function clearEntry(table: SyncTable, id: string, hlc: string) {
    await exec.run("DELETE FROM outbox WHERE table_name = ? AND row_id = ? AND hlc = ?", [
      table,
      id,
      hlc,
    ]);
  }

  /** Applies one server row under the conflict policy. Caller has suspended the outbox. Returns whether it was written. */
  async function applyRow(table: SyncTable, row: SyncRow): Promise<boolean> {
    const id = row.id;
    if (typeof id !== "string") return false;
    const existing = await readRow(table, id);
    const winner = resolveConflict(
      table,
      existing && {
        hlc: String(existing.hlc),
        categorization_method: existing.categorization_method,
      },
      { hlc: String(row.hlc), categorization_method: row.categorization_method },
    );
    if (winner === "existing") return false;
    await exec.run(upsertSql(table), upsertParams(table, row));
    if (winner === "incoming") {
      // our queued version (if any) just lost; the server's version is now ours
      await exec.run("DELETE FROM outbox WHERE table_name = ? AND row_id = ?", [table, id]);
    }
    return true;
  }

  return {
    getMeta: (key) => exclusive(() => readMeta(key)),
    async setMeta(key, value) {
      await exclusive(() =>
        exec.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [key, value]),
      );
    },

    async getCursor() {
      return Number((await exclusive(() => readMeta(CURSOR_KEY))) ?? 0);
    },

    maxHlc: () =>
      exclusive(async () => {
        let max = "";
        for (const table of SYNC_TABLES) {
          const rows = await exec.all<{ h: string | null }>(
            `SELECT MAX(hlc) AS h FROM ${q(table)}`,
          );
          const h = rows[0]?.h;
          if (h && h > max) max = h;
        }
        return max;
      }),

    counts: () =>
      exclusive(async (): Promise<OutboxCounts> => {
        const rows = await exec.all<{ failed: number; total: number }>(
          "SELECT COALESCE(SUM(attempts >= ?), 0) AS failed, COUNT(*) AS total FROM outbox",
          [MAX_PUSH_ATTEMPTS],
        );
        const failed = Number(rows[0]?.failed ?? 0);
        return { pending: Number(rows[0]?.total ?? 0) - failed, failed };
      }),

    pending: (limit) =>
      exclusive(async () => {
        const entries = await exec.all<{ id: number; table_name: string; row_id: string }>(
          "SELECT id, table_name, row_id FROM outbox WHERE attempts < ? ORDER BY id LIMIT ?",
          [MAX_PUSH_ATTEMPTS, limit],
        );
        const changes: Change[] = [];
        for (const e of entries) {
          if (!isSyncTable(e.table_name)) continue;
          const row = await readRow(e.table_name, e.row_id);
          if (!row) {
            await exec.run("DELETE FROM outbox WHERE id = ?", [e.id]); // row vanished: nothing to send
            continue;
          }
          changes.push({
            table: e.table_name,
            id: e.row_id,
            op: row.deleted_at == null ? "put" : "delete",
            hlc: String(row.hlc),
            row,
          });
        }
        return changes;
      }),

    acknowledge: (pushed, response: PushResponse) =>
      atomic(async () => {
        await suspend();
        try {
          const sent = new Map(pushed.map((c) => [`${c.table}/${c.id}`, c.hlc]));
          for (const a of response.accepted) {
            const hlcSent = sent.get(`${a.table}/${a.id}`);
            // stamp the cursor value on the row we pushed, unless it was edited again meanwhile
            await exec.run(`UPDATE ${q(a.table)} SET server_seq = ? WHERE id = ? AND hlc = ?`, [
              a.serverSeq,
              a.id,
              a.hlc,
            ]);
            if (hlcSent) await clearEntry(a.table, a.id, hlcSent);
          }
          for (const r of response.rejected) {
            const hlcSent = sent.get(`${r.table}/${r.id}`);
            if (r.reason === "stale" && r.current) {
              await applyRow(r.table, r.current);
              if (hlcSent) await clearEntry(r.table, r.id, hlcSent);
            } else {
              await exec.run(
                "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE table_name = ? AND row_id = ? AND hlc = ?",
                [r.reason, r.table, r.id, hlcSent ?? r.hlc],
              );
            }
          }
        } finally {
          await resume();
        }
      }),

    applyPulled: (rows: PulledRow[], cursor) =>
      atomic(async () => {
        await suspend();
        try {
          let applied = 0;
          for (const { table, row } of rows) if (await applyRow(table, row)) applied++;
          await exec.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)", [
            CURSOR_KEY,
            String(cursor),
          ]);
          return { applied };
        } finally {
          await resume();
        }
      }),

    enroll: (userId) =>
      atomic(async () => {
        // Never merge another account's data into this one: only placeholder (`local`) rows may be re-stamped.
        for (const table of SYNC_TABLES) {
          const foreign = await exec.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${q(table)} WHERE user_id NOT IN (?, ?)`,
            [LOCAL_USER_ID, userId],
          );
          if (Number(foreign[0]?.n ?? 0) > 0) {
            throw new Error(
              "This device holds data of another account; it cannot sign in as a different user.",
            );
          }
        }
        let touched = 0;
        for (const table of SYNC_TABLES) {
          // outbox triggers stay active here: re-stamping an UPDATE queues every row for the first push
          const rows = await exec.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${q(table)} WHERE user_id <> ?`,
            [userId],
          );
          touched += Number(rows[0]?.n ?? 0);
          await exec.run(`UPDATE ${q(table)} SET user_id = ? WHERE user_id <> ?`, [userId, userId]);
        }
        return touched;
      }),
  };
}

export { syncColumns };
