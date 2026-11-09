import type { Change, PulledRow, PushResponse } from "./protocol";

/** Entries that failed this many times are parked (shown as an error) instead of retried on every sync. */
export const MAX_PUSH_ATTEMPTS = 5;

export interface OutboxCounts {
  /** Changes waiting to be pushed. */
  pending: number;
  /** Changes the server refused (`invalid`, `forbidden`, `hlc_future`) and that are no longer retried. */
  failed: number;
}

/**
 * What the sync engine needs from the local database. `@wallt/db` implements it on SQLite; tests use an in-memory fake.
 * Every method is atomic: a crash never leaves a half-applied pull or a cleared-but-unsent outbox entry.
 */
export interface SyncStorePort {
  /** Oldest queued changes first, each carrying the row's *current* state. */
  pending(limit: number): Promise<Change[]>;
  counts(): Promise<OutboxCounts>;
  /** Records the server's verdict on a push: stamps `server_seq`, clears sent entries, applies rows that beat ours. */
  acknowledge(pushed: Change[], response: PushResponse): Promise<void>;
  /** Applies pulled rows (conflict policy per row) and moves the cursor, in one transaction. */
  applyPulled(rows: PulledRow[], cursor: number): Promise<{ applied: number }>;
  getCursor(): Promise<number>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  /** Highest `hlc` stored in any synced table ("" when empty): seeds the clock after a restart. */
  maxHlc(): Promise<string>;
}
