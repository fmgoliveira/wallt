import { SYNC_TABLES, type SyncTable } from "@wallt/sync";
import type { Db } from "../database";

/** A device unseen this long no longer holds a purge back (it is stale, or lost). */
export const STALE_DEVICE_MS = 90 * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  /** Rows removed per table. */
  purged: Partial<Record<SyncTable, number>>;
  total: number;
  /** Deleted rows that stay because a device has not applied them yet. */
  remaining: number;
  /** Devices that still have to sync before the rest can go. */
  waitingFor: { name: string; lastSeenAt: string | null }[];
}

const q = (name: string) => `"${name}"`;

/**
 * Removes the tombstones (soft-deleted rows) of one user from the server, once it is safe: a tombstone is only dropped
 * after every active device has applied it (its pull cursor, `devices.last_pull_seq`, is at or past the row's
 * `server_seq`). Dropping it earlier would let a device that still holds the live row push it back and resurrect it.
 * Revoked devices and devices unseen for `STALE_DEVICE_MS` do not hold it back.
 *
 * This is what makes "delete all data" actually remove the content from the server; older backups still contain it.
 */
export function purgeDeletedRows(db: Db, userId: string, nowMs: number): PurgeResult {
  const devices = db
    .prepare(
      "SELECT name, last_seen_at AS lastSeenAt, created_at AS createdAt, last_pull_seq AS pulled FROM devices WHERE user_id = ? AND revoked_at IS NULL",
    )
    .all(userId) as {
    name: string;
    lastSeenAt: string | null;
    createdAt: string;
    pulled: number | null;
  }[];
  const active = devices.filter(
    (d) => nowMs - Date.parse(d.lastSeenAt ?? d.createdAt) < STALE_DEVICE_MS,
  );
  // With no active device nothing can vouch for having applied the deletions: keep them.
  const watermark = active.length === 0 ? 0 : Math.min(...active.map((d) => d.pulled ?? 0));

  const purged: PurgeResult["purged"] = {};
  let total = 0;
  let remaining = 0;
  let newest = 0;
  db.transaction(() => {
    for (const table of SYNC_TABLES) {
      const r = db
        .prepare(
          `DELETE FROM ${q(table)} WHERE user_id = ? AND deleted_at IS NOT NULL AND server_seq IS NOT NULL AND server_seq <= ?`,
        )
        .run(userId, watermark);
      if (r.changes > 0) {
        purged[table] = r.changes;
        total += r.changes;
      }
      const left = db
        .prepare(
          `SELECT COUNT(*) AS n, COALESCE(MAX(server_seq), 0) AS newest FROM ${q(table)} WHERE user_id = ? AND deleted_at IS NOT NULL`,
        )
        .get(userId) as { n: number; newest: number };
      remaining += left.n;
      newest = Math.max(newest, left.newest);
    }
  })();

  const waitingFor =
    remaining === 0
      ? []
      : active
          .filter((d) => (d.pulled ?? 0) < newest)
          .map((d) => ({ name: d.name, lastSeenAt: d.lastSeenAt }));
  return { purged, total, remaining, waitingFor };
}

/** Purges every user (the nightly job). Returns the total number of rows removed. */
export function purgeAllUsers(db: Db, nowMs: number): number {
  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
  return users.reduce((n, u) => n + purgeDeletedRows(db, u.id, nowMs).total, 0);
}
