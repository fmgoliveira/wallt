import {
  DEFAULT_AUTO_LOCK_MS,
  hashPin,
  isValidPin,
  lockoutMs,
  newSalt,
  shouldLock,
  verifyPin,
} from "@wallt/core";
import { usePrivacyStore } from "@wallt/ui";
import { Platform } from "react-native";
import { create } from "zustand";
import { kvDelete, kvGet, kvSet } from "./kv";

const SETTINGS = "wallt.security";
const PIN = "wallt.pin";
const FAILS = "wallt.pin.fails";
const PRIVACY = "wallt.privacy";

/** The lock exists on the native apps only; web keeps just the privacy mode. */
export const lockSupported = Platform.OS !== "web";

interface SecurityState {
  ready: boolean;
  lockEnabled: boolean;
  timeoutMs: number;
  /** Offer fingerprint/face unlock (the device must have it enrolled). */
  biometrics: boolean;
  locked: boolean;
  failures: number;
  /** Epoch ms until which PIN attempts are refused. */
  blockedUntil: number;
}

export const useSecurityStore = create<SecurityState>(() => ({
  ready: false,
  lockEnabled: false,
  timeoutMs: DEFAULT_AUTO_LOCK_MS,
  biometrics: false,
  locked: false,
  failures: 0,
  blockedUntil: 0,
}));

const set = useSecurityStore.setState;
const get = useSecurityStore.getState;

let backgroundedAt: number | null = null;
let saved: { salt: string; hash: string } | null = null;

const persistSettings = () => {
  const { lockEnabled, timeoutMs, biometrics } = get();
  return kvSet(SETTINGS, JSON.stringify({ enabled: lockEnabled, timeoutMs, biometrics }));
};

function randomBytes(bytes: Uint8Array): Uint8Array {
  // Where the runtime has a CSPRNG use it; the salt only needs to be unique, so a fallback is acceptable.
  const c = globalThis.crypto as { getRandomValues?: (b: Uint8Array) => unknown } | undefined;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** Load stored settings once at startup. Locks straight away when the lock is on (cold start). */
export async function hydrateSecurity(): Promise<void> {
  const [rawSettings, rawPin, rawFails, rawPrivacy] = await Promise.all([
    kvGet(SETTINGS),
    kvGet(PIN),
    kvGet(FAILS),
    kvGet(PRIVACY),
  ]);

  usePrivacyStore.setState({ hidden: rawPrivacy === "1" });
  usePrivacyStore.subscribe((s, prev) => {
    if (s.hidden !== prev.hidden) void kvSet(PRIVACY, s.hidden ? "1" : "0");
  });

  if (!lockSupported) {
    set({ ready: true });
    return;
  }
  let parsed: { enabled?: boolean; timeoutMs?: number; biometrics?: boolean } = {};
  try {
    parsed = rawSettings ? JSON.parse(rawSettings) : {};
  } catch {
    parsed = {};
  }
  const [salt, hash] = (rawPin ?? "").split(":");
  saved = salt && hash ? { salt, hash } : null;
  let fails = { n: 0, until: 0 };
  try {
    fails = rawFails ? JSON.parse(rawFails) : fails;
  } catch {
    // reset on corrupt data
  }
  // A lock without a PIN could never be opened: treat it as off.
  const enabled = !!parsed.enabled && saved !== null;
  set({
    ready: true,
    lockEnabled: enabled,
    timeoutMs: typeof parsed.timeoutMs === "number" ? parsed.timeoutMs : DEFAULT_AUTO_LOCK_MS,
    biometrics: !!parsed.biometrics,
    locked: enabled,
    failures: fails.n,
    blockedUntil: fails.until,
  });
}

/** App went to the background. */
export function noteBackground(now = Date.now()): void {
  if (backgroundedAt === null) backgroundedAt = now;
}

/** App is back in the foreground: lock if it was away long enough. */
export function noteForeground(now = Date.now()): void {
  const { lockEnabled, timeoutMs, locked } = get();
  if (!locked && shouldLock({ enabled: lockEnabled, timeoutMs, backgroundedAt, now })) {
    set({ locked: true });
  }
  backgroundedAt = null;
}

export async function enableLock(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("PIN must be 4 to 8 digits");
  const salt = newSalt(randomBytes);
  const hash = hashPin(pin, salt);
  await kvSet(PIN, `${salt}:${hash}`);
  saved = { salt, hash };
  set({ lockEnabled: true, locked: false, failures: 0, blockedUntil: 0 });
  await Promise.all([persistSettings(), kvDelete(FAILS)]);
}

export async function disableLock(): Promise<void> {
  saved = null;
  set({ lockEnabled: false, locked: false, biometrics: false, failures: 0, blockedUntil: 0 });
  await Promise.all([kvDelete(PIN), kvDelete(FAILS), persistSettings()]);
}

export async function setAutoLock(timeoutMs: number): Promise<void> {
  set({ timeoutMs });
  await persistSettings();
}

export async function setBiometrics(on: boolean): Promise<void> {
  set({ biometrics: on });
  await persistSettings();
}

export type PinResult = "ok" | "wrong" | "blocked";

/** Check a PIN. Wrong attempts add up; after five in a row further tries are delayed (see `lockoutMs`). */
export async function submitPin(pin: string, now = Date.now()): Promise<PinResult> {
  const { blockedUntil, failures } = get();
  if (now < blockedUntil || !saved) return "blocked";
  if (verifyPin(pin, saved.salt, saved.hash)) {
    set({ locked: false, failures: 0, blockedUntil: 0 });
    await kvDelete(FAILS);
    return "ok";
  }
  const n = failures + 1;
  const until = lockoutMs(n) > 0 ? now + lockoutMs(n) : 0;
  set({ failures: n, blockedUntil: until });
  await kvSet(FAILS, JSON.stringify({ n, until }));
  return "wrong";
}

/** Does the device have a usable fingerprint/face? */
export async function biometricsAvailable(): Promise<boolean> {
  if (!lockSupported) return false;
  try {
    const auth = require("expo-local-authentication") as typeof import("expo-local-authentication");
    return (await auth.hasHardwareAsync()) && (await auth.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Ask the system biometric prompt. Resolves true and unlocks on success. The PIN stays the fallback. */
export async function unlockWithBiometrics(): Promise<boolean> {
  if (!lockSupported || !get().biometrics) return false;
  try {
    const auth = require("expo-local-authentication") as typeof import("expo-local-authentication");
    const result = await auth.authenticateAsync({
      promptMessage: "Unlock Wallt",
      cancelLabel: "Use PIN",
      disableDeviceFallback: true,
    });
    if (result.success) {
      set({ locked: false, failures: 0, blockedUntil: 0 });
      await kvDelete(FAILS);
      return true;
    }
  } catch {
    // fall through to the PIN
  }
  return false;
}

/** Verify the current PIN without changing lock state (for changing or turning off the lock). */
export function checkPin(pin: string): boolean {
  return !!saved && verifyPin(pin, saved.salt, saved.hash);
}
