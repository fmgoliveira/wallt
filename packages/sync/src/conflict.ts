import type { SyncTable } from "./tables";

/** The fields of a stored row that decide a conflict. `categorization_method` exists on `transactions` only. */
export interface ConflictView {
  hlc: string;
  categorization_method?: unknown;
}

export type Winner = "incoming" | "existing" | "same";

/**
 * Conflict policy (PLAN §4, ADR 0007): last writer wins per row by HLC.
 * Exception: a category chosen by the user (`categorization_method = 'user'`) beats one set by the classifier or a rule,
 * regardless of the clock, so a late ML recategorization can never overwrite a human decision.
 * Equal clock values are the same write (a retry or the echo of our own push): `same`.
 */
export function resolveConflict(
  table: SyncTable,
  existing: ConflictView | null,
  incoming: ConflictView,
): Winner {
  if (!existing) return "incoming";
  if (existing.hlc === incoming.hlc) return "same";
  if (table === "transactions") {
    const existingUser = existing.categorization_method === "user";
    const incomingUser = incoming.categorization_method === "user";
    if (existingUser && !incomingUser) return "existing";
    if (incomingUser && !existingUser) return "incoming";
  }
  return incoming.hlc > existing.hlc ? "incoming" : "existing";
}
