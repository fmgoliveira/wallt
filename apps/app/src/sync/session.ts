import {
  createAuthClient,
  createSessionManager,
  type SessionManager,
  type SessionStorage,
  type StoredSession,
} from "@wallt/sync";
import { Platform } from "react-native";
import { kvDelete, kvGet, kvSet } from "../security/kv";
import { configureSyncSession, getDeviceId } from "./runtime";

const KEY = "wallt.sync.session";

/** Session in the platform secure store on Android (Keystore); `localStorage` on web (same trade-off as ADR 0006). */
const storage: SessionStorage = {
  async load() {
    const raw = await kvGet(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  },
  save: (s) => kvSet(KEY, JSON.stringify(s)),
  clear: () => kvDelete(KEY),
};

const http = (url: string, init?: RequestInit) => fetch(url, init);

let manager: SessionManager | null = null;

async function activate(initial: StoredSession) {
  manager = createSessionManager({
    storage,
    fetch: http,
    initial,
    onSignedOut: () => void configureSyncSession(null),
  });
  const m = manager;
  await configureSyncSession({
    baseUrl: initial.baseUrl,
    userId: initial.userId,
    email: initial.email,
    getAccessToken: () => m.getAccessToken(),
  });
}

/** On launch: picks the saved session back up (no-op when signed out). Needs the database to be open. */
export async function restoreSession() {
  const saved = await storage.load();
  if (saved) await activate(saved);
}

export function authClientFor(baseUrl: string) {
  return createAuthClient({
    baseUrl,
    fetch: http,
    device: {
      deviceId: getDeviceId(),
      deviceName: Platform.OS === "web" ? "Web browser" : "Android phone",
      platform: Platform.OS === "android" ? "android" : Platform.OS === "web" ? "web" : "other",
    },
  });
}

/** Persists a freshly verified session and starts syncing. */
export async function completeSignIn(session: StoredSession) {
  await storage.save(session);
  try {
    await activate(session);
  } catch (error) {
    await storage.clear(); // e.g. this device holds another account's data
    await configureSyncSession(null);
    throw error;
  }
}

export async function signOut() {
  const current = manager?.current();
  if (current) await authClientFor(current.baseUrl).logout(current);
  await manager?.clear();
  manager = null;
  await configureSyncSession(null);
}
