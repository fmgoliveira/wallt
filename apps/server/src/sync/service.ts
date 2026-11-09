import {
  OUTBOX_SUSPENDED_KEY,
  SCHEMA_VERSION,
  upsertParams,
  upsertSql,
  validateSyncRow,
} from "@wallt/db";
import {
  type Accepted,
  type PulledRow,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  parseHlc,
  type Rejected,
  resolveConflict,
  SYNC_PULL_LIMIT,
  SYNC_TABLES,
  type SyncRow,
  type SyncTable,
} from "@wallt/sync";
import type { Db } from "../database";

const SEQ_KEY = "server_seq";
/** A pushed clock value this far ahead of the server's wall clock is refused. */
const MAX_HLC_DRIFT_MS = 24 * 60 * 60 * 1000;

export type SchemaCheck =
  | { ok: true }
  | { ok: false; error: "schema_outdated" | "server_outdated" };

const q = (name: string) => `"${name}"`;

/**
 * Server side of the sync protocol (ADR 0007). Synchronous on purpose: better-sqlite3 is single-writer, so one push is one
 * transaction and `server_seq` values commit in order; a pull can never see seq N+1 before N.
 */
export function createSyncService(db: Db, now: () => number = Date.now) {
  // The server's own writes are not a device outbox; make sure the counter exists.
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, '1')").run(
    OUTBOX_SUSPENDED_KEY,
  );
  db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?, '0')").run(SEQ_KEY);

  const nextSeq = db.prepare(
    "UPDATE sync_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = ? RETURNING CAST(value AS INTEGER) AS seq",
  );
  const readers = new Map<SyncTable, ReturnType<Db["prepare"]>>();
  const upserts = new Map<SyncTable, ReturnType<Db["prepare"]>>();
  const reader = (t: SyncTable) => {
    let s = readers.get(t);
    if (!s) {
      s = db.prepare(`SELECT * FROM ${q(t)} WHERE id = ?`);
      readers.set(t, s);
    }
    return s;
  };
  const upserter = (t: SyncTable) => {
    let s = upserts.get(t);
    if (!s) {
      s = db.prepare(upsertSql(t));
      upserts.set(t, s);
    }
    return s;
  };

  function checkSchema(clientVersion: number): SchemaCheck {
    if (clientVersion < SCHEMA_VERSION) return { ok: false, error: "schema_outdated" };
    if (clientVersion > SCHEMA_VERSION) return { ok: false, error: "server_outdated" };
    return { ok: true };
  }

  function pushOne(userId: string, change: PushRequest["changes"][number]): Accepted | Rejected {
    const { table, id, hlc, row } = change;
    const reject = (reason: Rejected["reason"], current?: SyncRow): Rejected => ({
      table,
      id,
      hlc,
      reason,
      ...(current ? { current } : {}),
    });

    if (row.id !== id || row.hlc !== hlc) return reject("invalid");
    if ((change.op === "delete") !== (row.deleted_at != null)) return reject("invalid");
    if (validateSyncRow(table, row) !== null) return reject("invalid");
    const parsed = parseHlc(hlc);
    if (!parsed) return reject("invalid");
    if (parsed.ms > now() + MAX_HLC_DRIFT_MS) return reject("hlc_future");

    const existing = reader(table).get(id) as SyncRow | undefined;
    if (existing && existing.user_id !== userId) return reject("forbidden");

    const winner = resolveConflict(
      table,
      existing
        ? { hlc: String(existing.hlc), categorization_method: existing.categorization_method }
        : null,
      { hlc, categorization_method: row.categorization_method },
    );
    if (winner === "existing") return reject("stale", existing);
    if (winner === "same" && existing) {
      return { table, id, hlc, serverSeq: Number(existing.server_seq) };
    }
    const { seq } = nextSeq.get(SEQ_KEY) as { seq: number };
    const stored: SyncRow = { ...row, user_id: userId, server_seq: seq };
    upserter(table).run(upsertParams(table, stored));
    return { table, id, hlc, serverSeq: seq };
  }

  const pushTx = db.transaction((userId: string, changes: PushRequest["changes"]) => {
    const accepted: Accepted[] = [];
    const rejected: Rejected[] = [];
    for (const change of changes) {
      const out = pushOne(userId, change);
      if ("serverSeq" in out) accepted.push(out);
      else rejected.push(out);
    }
    return { accepted, rejected };
  });

  return {
    checkSchema,
    serverSchemaVersion: SCHEMA_VERSION,

    push(userId: string, req: PushRequest): PushResponse {
      const { accepted, rejected } = pushTx(userId, req.changes);
      return { accepted, rejected, schemaVersion: SCHEMA_VERSION };
    },

    pull(userId: string, since: number, limit: number = SYNC_PULL_LIMIT): PullResponse {
      const n = Math.max(1, Math.min(limit, SYNC_PULL_LIMIT));
      const rows: PulledRow[] = [];
      for (const table of SYNC_TABLES) {
        const part = db
          .prepare(
            `SELECT * FROM ${q(table)} WHERE user_id = ? AND server_seq > ? ORDER BY server_seq LIMIT ?`,
          )
          .all(userId, since, n + 1) as SyncRow[];
        for (const row of part) rows.push({ table, row });
      }
      rows.sort((a, b) => Number(a.row.server_seq) - Number(b.row.server_seq));
      const page = rows.slice(0, n);
      return {
        changes: page,
        cursor: page.length ? Number(page[page.length - 1]?.row.server_seq) : since,
        hasMore: rows.length > n,
        schemaVersion: SCHEMA_VERSION,
      };
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
