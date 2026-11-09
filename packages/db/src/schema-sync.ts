import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Sync bookkeeping (ADR 0007). Neither table is itself synced.
 * - `outbox`: one entry per (table, row) that changed locally and is not on the server yet. Filled by triggers on every
 *   synced table (see `outbox-triggers.ts`), so no write path can forget it. The row's current state is read at push
 *   time, so an entry only needs to say *which* row, not carry a snapshot.
 * - `sync_meta`: key/value. Client: `pull_cursor`, `last_sync_at`, `node_id`, `outbox_suspended`. Server: `server_seq`.
 */
export const outbox = sqliteTable(
  "outbox",
  {
    id: integer("id").primaryKey(),
    tableName: text("table_name").notNull(),
    rowId: text("row_id").notNull(),
    /** `put`, or `delete` when the row is a tombstone. */
    op: text("op").notNull(),
    /** Clock value of the queued version; an acknowledgement only clears the entry while this still matches. */
    hlc: text("hlc").notNull(),
    queuedAt: text("queued_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("outbox_row_idx").on(t.tableName, t.rowId)],
);

export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
