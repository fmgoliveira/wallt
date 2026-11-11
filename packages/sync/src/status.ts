import type { SyncErrorKind, SyncState } from "./engine";

export type SyncTone = "neutral" | "positive" | "warning" | "negative";

const PROBLEMS: Record<SyncErrorKind, string> = {
  offline: "Offline",
  unauthorized: "Sign in again to sync",
  schema_outdated: "Update the app to sync",
  server_outdated: "Server needs an update",
  server: "Sync failed",
};

/** Age of a timestamp as a unit and amount, for UIs that translate it. */
export type TimeAgoParts = { unit: "now" } | { unit: "min" | "h" | "d"; n: number };

export function timeAgoParts(from: number, now: number): TimeAgoParts {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 45) return { unit: "now" };
  const m = Math.round(s / 60);
  if (m < 60) return { unit: "min", n: m };
  const h = Math.round(m / 60);
  if (h < 48) return { unit: "h", n: h };
  return { unit: "d", n: Math.round(h / 24) };
}

/** "just now", "2 min ago", "3 h ago", "5 d ago". */
export function timeAgo(from: number, now: number): string {
  const p = timeAgoParts(from, now);
  return p.unit === "now" ? "just now" : `${p.n} ${p.unit} ago`;
}

/** Machine-readable sync status; `describeSync` renders it in English, apps translate it. */
export type SyncStatusParts = {
  tone: SyncTone;
  /** How many changes are queued, shown after the main text. */
  pending: number;
} & (
  | { kind: "local" }
  | { kind: "syncing" }
  | { kind: "refused"; count: number }
  | { kind: "problem"; problem: SyncErrorKind }
  | { kind: "never" }
  | { kind: "synced"; ago: TimeAgoParts }
);

export function describeSyncParts(state: SyncState | null, now: number): SyncStatusParts {
  if (!state) return { kind: "local", tone: "neutral", pending: 0 };
  const pending = state.pending;
  if (state.syncing) return { kind: "syncing", tone: "neutral", pending };
  if (state.failed > 0) return { kind: "refused", count: state.failed, tone: "negative", pending };
  if (state.problem) {
    return {
      kind: "problem",
      problem: state.problem,
      tone: state.problem === "offline" ? "warning" : "negative",
      pending,
    };
  }
  if (state.lastSyncedAt === null) return { kind: "never", tone: "neutral", pending };
  return {
    kind: "synced",
    ago: timeAgoParts(state.lastSyncedAt, now),
    tone: pending > 0 ? "warning" : "positive",
    pending,
  };
}

/** Text and tone of the sync status indicator (PLAN §10 P3.3) for an engine state. `null` = not signed in. */
export function describeSync(
  state: SyncState | null,
  now: number,
): { label: string; tone: SyncTone } {
  const p = describeSyncParts(state, now);
  const queued = p.pending > 0 ? ` · ${p.pending} waiting` : "";
  switch (p.kind) {
    case "local":
      return { label: "Local only", tone: p.tone };
    case "syncing":
      return { label: `Syncing…${queued}`, tone: p.tone };
    case "refused":
      return { label: `${p.count} change(s) refused by the server`, tone: p.tone };
    case "problem":
      return { label: `${PROBLEMS[p.problem]}${queued}`, tone: p.tone };
    case "never":
      return { label: `Not synced yet${queued}`, tone: p.tone };
    case "synced": {
      const ago = p.ago.unit === "now" ? "just now" : `${p.ago.n} ${p.ago.unit} ago`;
      return { label: `Synced ${ago}${queued}`, tone: p.tone };
    }
  }
}
