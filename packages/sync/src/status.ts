import type { SyncErrorKind, SyncState } from "./engine";

export type SyncTone = "neutral" | "positive" | "warning" | "negative";

const PROBLEMS: Record<SyncErrorKind, string> = {
  offline: "Offline",
  unauthorized: "Sign in again to sync",
  schema_outdated: "Update the app to sync",
  server_outdated: "Server needs an update",
  server: "Sync failed",
};

/** "just now", "2 min ago", "3 h ago", "5 d ago". */
export function timeAgo(from: number, now: number): string {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Text and tone of the sync status indicator (PLAN §10 P3.3) for an engine state. `null` = not signed in. */
export function describeSync(
  state: SyncState | null,
  now: number,
): { label: string; tone: SyncTone } {
  if (!state) return { label: "Local only", tone: "neutral" };
  const queued = state.pending > 0 ? ` · ${state.pending} waiting` : "";
  if (state.syncing) return { label: `Syncing…${queued}`, tone: "neutral" };
  if (state.failed > 0) {
    return { label: `${state.failed} change(s) refused by the server`, tone: "negative" };
  }
  if (state.problem) {
    return {
      label: `${PROBLEMS[state.problem]}${queued}`,
      tone: state.problem === "offline" ? "warning" : "negative",
    };
  }
  if (state.lastSyncedAt === null) return { label: `Not synced yet${queued}`, tone: "neutral" };
  return {
    label: `Synced ${timeAgo(state.lastSyncedAt, now)}${queued}`,
    tone: state.pending > 0 ? "warning" : "positive",
  };
}
