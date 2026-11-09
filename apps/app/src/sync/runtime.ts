import type { FxRepository, SyncStore } from "@wallt/db";
import { SCHEMA_VERSION } from "@wallt/db";
import {
  createHttpTransport,
  createSyncEngine,
  type HlcClock,
  pullFxRates,
  type SyncEngine,
  type SyncState,
} from "@wallt/sync";
import { create } from "zustand";

/** What the device registers once its database is open (see `repositoryFromDatabase`). */
export interface SyncRuntime {
  store: SyncStore;
  clock: HlcClock;
  /** Local copy of the server's ECB rates, refreshed after syncs. */
  fx: FxRepository;
  deviceId: string;
  /** Merges duplicate default categories that other devices seeded; returns how many copies were merged. */
  dedupeCategories(): Promise<number>;
  /** Switches the owner of future local writes (after `store.enroll`). */
  setUserId(userId: string): void;
}

/** A signed-in server session. There is no sign-in UI yet (ADR 0007, open point), so nothing sets this today. */
export interface SyncSession {
  email: string;
  baseUrl: string;
  userId: string;
  getAccessToken: () => Promise<string | null>;
}

interface SyncUiState {
  session: SyncSession | null;
  engine: SyncState | null;
}

export const useSyncUi = create<SyncUiState>(() => ({ session: null, engine: null }));

let runtime: SyncRuntime | null = null;
let engine: SyncEngine | null = null;
let unsubscribe: (() => void) | null = null;
let onPulled: (() => void) | null = null;
let onFxChanged: (() => void) | null = null;
let lastFxAttempt = 0;
const FX_REFRESH_MS = 60 * 60 * 1000;

export function getDeviceId(): string {
  if (!runtime) throw new Error("Database is not open yet");
  return runtime.deviceId;
}

/** Device-local key/value storage (`sync_meta`: never synced, never leaves the device), once the database is open. */
export function getDeviceMeta(): Pick<SyncStore, "getMeta" | "setMeta"> | null {
  return runtime?.store ?? null;
}

export function registerSyncRuntime(next: SyncRuntime) {
  runtime = next;
}

/** Called by the data provider: invoked after a sync brought in remote rows, so cached queries refetch. */
export function setOnRemoteChanges(fn: (() => void) | null) {
  onPulled = fn;
}

/** Called by the data provider: invoked after new FX rates were stored, so converted totals recompute. */
export function setOnFxChanges(fn: (() => void) | null) {
  onFxChanged = fn;
}

/** Downloads newer ECB rates (at most hourly unless forced). Failures are silent: old rates keep working. */
export async function refreshFxRates(session: SyncSession, force = false) {
  if (!runtime || (!force && Date.now() - lastFxAttempt < FX_REFRESH_MS)) return;
  lastFxAttempt = Date.now();
  const result = await pullFxRates({
    baseUrl: session.baseUrl,
    getAccessToken: session.getAccessToken,
    fetch: (url, init) => fetch(url, init),
    store: runtime.fx,
  });
  if (result.ok && result.fetched > 0) onFxChanged?.();
}

/** Local write happened (called by the mutation cache). No-op while signed out. */
export function notifyLocalWrite() {
  engine?.notifyLocalWrite();
}

export function syncNow() {
  return engine?.syncNow() ?? Promise.resolve();
}

/**
 * Signs the sync engine in or out. On sign-in: re-stamps local rows to the server user (first time only) and starts the
 * engine. Passing null stops it; local data stays on the device.
 */
export async function configureSyncSession(session: SyncSession | null) {
  engine?.stop();
  unsubscribe?.();
  engine = null;
  unsubscribe = null;
  useSyncUi.setState({ session, engine: null });
  if (!session || !runtime) return;

  await runtime.store.enroll(session.userId);
  runtime.setUserId(session.userId);
  const next = createSyncEngine({
    store: runtime.store,
    transport: createHttpTransport({
      baseUrl: session.baseUrl,
      getAccessToken: session.getAccessToken,
      fetch: (url, init) => fetch(url, init),
    }),
    clock: runtime.clock,
    deviceId: runtime.deviceId,
    schemaVersion: SCHEMA_VERSION,
  });
  let lastSeen: number | null = null;
  unsubscribe = next.subscribe((state) => {
    useSyncUi.setState({ engine: state });
    if (!state.syncing && state.lastSyncedAt !== lastSeen) {
      lastSeen = state.lastSyncedAt;
      // other devices seed their own default categories: merge their copies, then refresh (the merge syncs back)
      void runtime
        ?.dedupeCategories()
        .catch(() => 0)
        .then((merged) => {
          if (merged > 0) next.notifyLocalWrite();
          onPulled?.();
        });
      void refreshFxRates(session);
    }
  });
  engine = next;
  await next.start();
}
