import { isSyncTable, SYNC_TABLES, type SyncRow, type SyncTable } from "@wallt/sync";
import { dedupeSystemCategories, type Stamp } from "./dedupe";
import { SCHEMA_VERSION } from "./migrate";
import type { RawSqlExecutor } from "./repository/executor";
import { syncColumns, upsertParams, upsertSql, validateSyncRow } from "./sync/tables";

/**
 * Whole-ledger export, restore and erase (plan §1.3, P7.3). Works on the synced tables generically, exactly as
 * sync does, so every entity is covered and a new table cannot be forgotten.
 */

export const EXPORT_KIND = "wallt-export";
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  kind: typeof EXPORT_KIND;
  version: typeof EXPORT_VERSION;
  /** Database schema the rows were written with; a bundle from a newer schema is refused. */
  schemaVersion: number;
  exportedAt: string;
  /** Live (not deleted) rows of every synced table, as stored (snake_case columns, integer minor units). */
  tables: Record<SyncTable, SyncRow[]>;
}

export class DataImportError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "newer" | "notEmpty",
  ) {
    super(message);
  }
}

export interface DataStore {
  /** Every live row of every synced table. */
  exportBundle(now: string): Promise<ExportBundle>;
  /**
   * Restores a bundle into an empty ledger (no accounts or transactions yet). Rows keep their ids, are owned by
   * `userId` and queue for sync like any new data. Throws `DataImportError`.
   */
  importBundle(bundle: unknown, userId: string): Promise<{ rows: number }>;
  /**
   * Soft-deletes every live row (tombstones), so the deletion syncs to the server and the other devices. The built-in
   * default categories stay. Returns the number of rows deleted.
   */
  eraseAll(): Promise<number>;
}

const q = (name: string) => `"${name}"`;

export function createDataStore(
  exec: RawSqlExecutor,
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>,
  stamp: Stamp,
): DataStore {
  const atomic = <T>(fn: () => Promise<T>) => exclusive(() => exec.transaction(fn));

  return {
    exportBundle: (now) =>
      exclusive(async () => {
        const tables = {} as Record<SyncTable, SyncRow[]>;
        for (const table of SYNC_TABLES) {
          tables[table] = await exec.all<SyncRow>(
            `SELECT * FROM ${q(table)} WHERE deleted_at IS NULL ORDER BY id`,
          );
        }
        return {
          kind: EXPORT_KIND,
          version: EXPORT_VERSION,
          schemaVersion: SCHEMA_VERSION,
          exportedAt: now,
          tables,
        };
      }),

    importBundle: async (input, userId) => {
      const result = await atomic(async () => {
        const bundle = parseBundle(input);
        for (const table of ["accounts", "transactions"] as const) {
          const live = await exec.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${q(table)} WHERE deleted_at IS NULL`,
          );
          if (Number(live[0]?.n ?? 0) > 0) {
            throw new DataImportError(
              "Restore needs an empty ledger: this one already has accounts or transactions.",
              "notEmpty",
            );
          }
        }
        let rows = 0;
        // SYNC_TABLES is in dependency order (accounts and categories before the rows that point at them).
        for (const table of SYNC_TABLES) {
          for (const row of bundle.tables[table]) {
            // Ours now: re-owned, not yet on the server, and queued for the first push by the outbox triggers.
            const mine: SyncRow = { ...row, user_id: userId, server_seq: null, deleted_at: null };
            const problem = validateSyncRow(table, mine);
            if (problem) throw new DataImportError(`${table}: ${problem}`, "invalid");
            await exec.run(upsertSql(table), upsertParams(table, mine));
            rows++;
          }
        }
        return { rows };
      });
      // The empty ledger already holds this device's default categories; merge them with the restored ones
      // (its own transaction, so it runs after the import one).
      await exclusive(() => dedupeSystemCategories(exec, stamp));
      return result;
    },

    eraseAll: () =>
      atomic(async () => {
        let deleted = 0;
        for (const table of [...SYNC_TABLES].reverse()) {
          const { now, hlc } = stamp();
          // The built-in default categories are app furniture, not the user's data, and are only ever seeded
          // once per device: they stay so the emptied ledger is usable straight away.
          const where =
            table === "categories"
              ? "deleted_at IS NULL AND system_key IS NULL"
              : "deleted_at IS NULL";
          const live = await exec.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM ${q(table)} WHERE ${where}`,
          );
          deleted += Number(live[0]?.n ?? 0);
          await exec.run(
            `UPDATE ${q(table)} SET deleted_at = ?, updated_at = ?, hlc = ? WHERE ${where}`,
            [now, now, hlc],
          );
        }
        return deleted;
      }),
  };
}

/** Checks the envelope and that every table is present with object rows; row contents are checked on insert. */
export function parseBundle(input: unknown): ExportBundle {
  const b = input as Partial<ExportBundle> | null;
  if (
    !b ||
    typeof b !== "object" ||
    b.kind !== EXPORT_KIND ||
    typeof b.tables !== "object" ||
    !b.tables
  ) {
    throw new DataImportError("This is not a Wallt export file.", "invalid");
  }
  if (b.version !== EXPORT_VERSION) {
    throw new DataImportError("This export comes from a newer version of Wallt.", "newer");
  }
  if (typeof b.schemaVersion !== "number" || b.schemaVersion > SCHEMA_VERSION) {
    throw new DataImportError(
      "This export was made with a newer database version; update Wallt first.",
      "newer",
    );
  }
  const tables = {} as Record<SyncTable, SyncRow[]>;
  for (const table of SYNC_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[table];
    // a bundle from an older version may lack a table that was added later
    if (rows === undefined) {
      tables[table] = [];
      continue;
    }
    if (
      !Array.isArray(rows) ||
      !rows.every((r) => r && typeof r === "object" && !Array.isArray(r))
    ) {
      throw new DataImportError(`${table} is not a list of rows.`, "invalid");
    }
    tables[table] = rows as SyncRow[];
  }
  for (const key of Object.keys(b.tables)) {
    if (!isSyncTable(key)) throw new DataImportError(`Unknown table ${key}.`, "invalid");
  }
  return { ...(b as ExportBundle), tables };
}

/* ------------------------------------------------------------------------------------------------ CSV */

/** Columns that are sync plumbing, not data the user cares about. */
const CSV_HIDDEN = new Set(["user_id", "hlc", "server_seq", "deleted_at"]);

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * One table as CSV (header row, comma-separated, `\n` line ends, UTF-8 with a BOM so Excel reads accents). Amounts
 * stay integer minor units (cents); booleans are 0/1; JSON columns are JSON text.
 */
export function tableToCsv(table: SyncTable, rows: readonly SyncRow[]): string {
  const cols = syncColumns(table)
    .map((c) => c.name)
    .filter((c) => !CSV_HIDDEN.has(c));
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(","));
  return `﻿${lines.join("\n")}\n`;
}
