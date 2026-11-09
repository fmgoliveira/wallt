import type { HlcClock } from "./hlc";
import {
  type PullResponse,
  type PushRequest,
  type PushResponse,
  SYNC_PULL_LIMIT,
  SYNC_PUSH_LIMIT,
} from "./protocol";
import type { SyncStorePort } from "./store";

/** Why a sync attempt failed; the status indicator maps each to a message. */
export type SyncErrorKind =
  | "offline"
  | "unauthorized"
  | "schema_outdated"
  | "server_outdated"
  | "server";

export class SyncTransportError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "SyncTransportError";
  }
}

/** The network side of sync. `@wallt/sync` ships an HTTP implementation (`createHttpTransport`). */
export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(params: { since: number; limit: number; schemaVersion: number }): Promise<PullResponse>;
}

export interface SyncState {
  /** True while a sync is running. */
  syncing: boolean;
  /** Why the last attempt failed; null after a success. `unauthorized` and the schema errors need user action. */
  problem: SyncErrorKind | null;
  /** Epoch ms of the last completed sync (persisted), null if never. */
  lastSyncedAt: number | null;
  /** Local changes not on the server yet. */
  pending: number;
  /** Changes the server refused for good (shown as an error badge). */
  failed: number;
}

export interface SyncEngineOptions {
  store: SyncStorePort;
  transport: SyncTransport;
  /** Fed with every clock value seen from the server so later local writes sort after it. */
  clock?: HlcClock;
  deviceId: string;
  /** `SCHEMA_VERSION` of this build. */
  schemaVersion: number;
  now?: () => number;
  /** Delay after a local write before syncing. Default 2 s (PLAN §4). */
  debounceMs?: number;
  /** Periodic sync while running. Default 5 min. */
  intervalMs?: number;
}

export interface SyncEngine {
  getState(): SyncState;
  subscribe(listener: (state: SyncState) => void): () => void;
  /** Initial sync plus the periodic timer. */
  start(): Promise<void>;
  stop(): void;
  /** Push then pull now (manual refresh, app foreground). Concurrent calls share one run. */
  syncNow(): Promise<void>;
  /** Call after a local write: refreshes the counters and schedules a debounced sync. */
  notifyLocalWrite(): void;
}

const LAST_SYNC_KEY = "last_sync_at";

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { store, transport, clock } = options;
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? 2000;
  const intervalMs = options.intervalMs ?? 5 * 60_000;

  let state: SyncState = {
    syncing: false,
    problem: null,
    lastSyncedAt: null,
    pending: 0,
    failed: 0,
  };
  const listeners = new Set<(s: SyncState) => void>();
  let running: Promise<void> | null = null;
  let rerun = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  async function refreshCounts() {
    const { pending, failed } = await store.counts();
    set({ pending, failed });
  }

  async function pushAll() {
    for (;;) {
      const changes = await store.pending(SYNC_PUSH_LIMIT);
      if (changes.length === 0) return;
      const response = await transport.push({
        deviceId: options.deviceId,
        schemaVersion: options.schemaVersion,
        changes,
      });
      for (const r of response.rejected) if (r.current) clock?.receive(String(r.current.hlc));
      await store.acknowledge(changes, response);
      await refreshCounts();
      // Rejections that are not `stale` stay queued (and are parked after a few tries): stop instead of looping.
      const progressed =
        response.accepted.length > 0 || response.rejected.some((r) => r.reason === "stale");
      if (!progressed) return;
    }
  }

  async function pullAll() {
    let since = await store.getCursor();
    for (;;) {
      const page = await transport.pull({
        since,
        limit: SYNC_PULL_LIMIT,
        schemaVersion: options.schemaVersion,
      });
      if (clock) for (const c of page.changes) clock.receive(String(c.row.hlc));
      await store.applyPulled(page.changes, page.cursor);
      since = page.cursor;
      if (!page.hasMore) return;
    }
  }

  async function cycle() {
    set({ syncing: true });
    try {
      await pushAll();
      await pullAll();
      const at = now();
      await store.setMeta(LAST_SYNC_KEY, String(at));
      set({ problem: null, lastSyncedAt: at });
    } catch (error) {
      set({
        problem: error instanceof SyncTransportError ? error.kind : "server",
      });
    } finally {
      await refreshCounts().catch(() => undefined);
      set({ syncing: false });
    }
  }

  function syncNow(): Promise<void> {
    if (running) {
      rerun = true; // a write landed mid-sync: go once more when this run ends
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          await cycle();
        } while (rerun && state.problem === null);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (interval) return;
      const saved = await store.getMeta(LAST_SYNC_KEY);
      if (saved) set({ lastSyncedAt: Number(saved) });
      await refreshCounts();
      interval = setInterval(() => void syncNow(), intervalMs);
      await syncNow();
    },
    stop() {
      if (interval) clearInterval(interval);
      if (debounce) clearTimeout(debounce);
      interval = null;
      debounce = null;
    },
    syncNow,
    notifyLocalWrite() {
      void refreshCounts().catch(() => undefined);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void syncNow();
      }, debounceMs);
    },
  };
}
