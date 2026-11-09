import { z } from "zod";
import { SYNC_TABLES, type SyncTable } from "./tables";

/**
 * Wire protocol (PLAN §4). A row travels as its database record: snake_case column names, scalar JSON values
 * (booleans as 0/1). The server owns `server_seq` and `user_id`.
 */
export const SYNC_PUSH_LIMIT = 500;
export const SYNC_PULL_LIMIT = 500;

const scalar = z.union([z.string(), z.number(), z.null()]);
export const syncRowSchema = z.record(z.string(), scalar);
export type SyncRow = z.infer<typeof syncRowSchema>;

export const changeSchema = z.object({
  table: z.enum(SYNC_TABLES),
  id: z.string().min(1).max(64),
  /** `delete` = the row is a tombstone (`deleted_at` set). Both carry the full row. */
  op: z.enum(["put", "delete"]),
  hlc: z.string().min(1).max(128),
  row: syncRowSchema,
});
export type Change = z.infer<typeof changeSchema>;

export const pushRequestSchema = z.object({
  deviceId: z.string().min(1).max(64),
  schemaVersion: z.number().int().min(0),
  changes: z.array(changeSchema).max(SYNC_PUSH_LIMIT),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export type RejectReason =
  /** The server already holds a newer version (`current` carries it). */
  | "stale"
  /** The row belongs to another user. */
  | "forbidden"
  /** The row does not match the table (unknown/missing columns, wrong types). */
  | "invalid"
  /** The clock value is implausibly far in the future. */
  | "hlc_future";

export interface Accepted {
  table: SyncTable;
  id: string;
  hlc: string;
  serverSeq: number;
}
export interface Rejected {
  table: SyncTable;
  id: string;
  hlc: string;
  reason: RejectReason;
  current?: SyncRow;
}
export interface PushResponse {
  accepted: Accepted[];
  rejected: Rejected[];
  schemaVersion: number;
}

export interface PulledRow {
  table: SyncTable;
  row: SyncRow;
}
export interface PullResponse {
  changes: PulledRow[];
  /** Pass as `since` next time. */
  cursor: number;
  hasMore: boolean;
  schemaVersion: number;
}

/** API error body on 409: the two sides run different schema versions. */
export interface SchemaMismatch {
  error: "schema_outdated" | "server_outdated";
  serverSchemaVersion: number;
}
