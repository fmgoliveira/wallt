import { SYNC_TABLES } from "@wallt/sync";

/** `sync_meta` key: while present, writes are not queued (set around applying server rows, and permanently on the server). */
export const OUTBOX_SUSPENDED_KEY = "outbox_suspended";

/**
 * SQL for the triggers that queue every local change to a synced table (ADR 0007). One AFTER INSERT and one AFTER UPDATE
 * per table; deletes are tombstone updates, so there is no DELETE trigger. They are generated from `SYNC_TABLES` and
 * frozen into migration 0002; `db.test.ts` fails when the two drift, so a new synced table must ship its triggers.
 */
export function outboxTriggerStatements(tables: readonly string[] = SYNC_TABLES): string[] {
  return tables.flatMap((table) =>
    (["insert", "update"] as const).map((event) =>
      [
        `CREATE TRIGGER \`${table}_outbox_${event === "insert" ? "i" : "u"}\` AFTER ${event.toUpperCase()} ON \`${table}\``,
        `WHEN NOT EXISTS (SELECT 1 FROM \`sync_meta\` WHERE \`key\` = '${OUTBOX_SUSPENDED_KEY}')`,
        "BEGIN",
        "INSERT INTO `outbox` (`table_name`, `row_id`, `op`, `hlc`, `queued_at`, `attempts`, `last_error`)",
        `VALUES ('${table}', NEW.\`id\`, CASE WHEN NEW.\`deleted_at\` IS NULL THEN 'put' ELSE 'delete' END, NEW.\`hlc\`, NEW.\`updated_at\`, 0, NULL)`,
        "ON CONFLICT(`table_name`, `row_id`) DO UPDATE SET `op` = excluded.`op`, `hlc` = excluded.`hlc`, `queued_at` = excluded.`queued_at`, `attempts` = 0, `last_error` = NULL;",
        "END",
      ].join("\n"),
    ),
  );
}
