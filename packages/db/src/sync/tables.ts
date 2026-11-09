import { isSyncTable, type SyncRow, type SyncTable } from "@wallt/sync";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../schema";

/** Drizzle table behind every synced table name. Used for column metadata only (SQL here is raw, snake_case). */
export const SYNC_TABLE_DEFS: Record<SyncTable, SQLiteTable> = {
  accounts: schema.accounts,
  categories: schema.categories,
  transactions: schema.transactions,
  transaction_splits: schema.transactionSplits,
  tags: schema.tags,
  transaction_tags: schema.transactionTags,
  budgets: schema.budgets,
  recurring_rules: schema.recurringRules,
  goals: schema.goals,
  debts: schema.debts,
  rules: schema.rules,
  payee_aliases: schema.payeeAliases,
  attachments: schema.attachments,
  import_profiles: schema.importProfiles,
};

export interface ColumnInfo {
  name: string;
  kind: "string" | "integer" | "real" | "boolean";
  notNull: boolean;
}

const columnCache = new Map<SyncTable, ColumnInfo[]>();

/** Column names/types of a synced table as stored (snake_case), in declaration order. */
export function syncColumns(table: SyncTable): ColumnInfo[] {
  let cols = columnCache.get(table);
  if (!cols) {
    const def = SYNC_TABLE_DEFS[table];
    if (getTableName(def) !== table) throw new Error(`SYNC_TABLE_DEFS mismatch for ${table}`);
    cols = Object.values(getTableColumns(def)).map((c) => ({
      name: c.name,
      kind:
        c.dataType === "boolean"
          ? "boolean"
          : c.dataType === "number"
            ? c.columnType === "SQLiteReal"
              ? "real"
              : "integer"
            : "string",
      notNull: c.notNull,
    }));
    columnCache.set(table, cols);
  }
  return cols;
}

const q = (name: string) => `"${name}"`;

/** `INSERT ... ON CONFLICT(id) DO UPDATE` writing every column; params in `syncColumns` order. */
export function upsertSql(table: SyncTable): string {
  const cols = syncColumns(table).map((c) => c.name);
  const updates = cols.filter((c) => c !== "id").map((c) => `${q(c)} = excluded.${q(c)}`);
  return `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT("id") DO UPDATE SET ${updates.join(", ")}`;
}

export function upsertParams(table: SyncTable, row: SyncRow): unknown[] {
  return syncColumns(table).map((c) => row[c.name] ?? null);
}

/**
 * Checks a wire row against the table: exactly the table's columns, scalar types, NOT NULL respected, booleans 0/1.
 * Business rules (money signs, splits adding up) are the authoring client's job; this only keeps garbage out of the DB.
 */
export function validateSyncRow(table: SyncTable, row: SyncRow): string | null {
  const cols = syncColumns(table);
  const names = new Set(cols.map((c) => c.name));
  for (const key of Object.keys(row)) if (!names.has(key)) return `unknown column ${key}`;
  for (const c of cols) {
    const v = row[c.name];
    if (v === undefined) return `missing column ${c.name}`;
    if (v === null) {
      if (c.notNull && c.name !== "server_seq") return `${c.name} must not be null`;
      continue;
    }
    if (c.kind === "string" && typeof v !== "string") return `${c.name} must be text`;
    if (c.kind === "real" && (typeof v !== "number" || !Number.isFinite(v)))
      return `${c.name} must be a number`;
    if (c.kind === "integer" && !Number.isSafeInteger(v)) return `${c.name} must be an integer`;
    if (c.kind === "boolean" && v !== 0 && v !== 1) return `${c.name} must be 0 or 1`;
  }
  return null;
}

export { isSyncTable };
