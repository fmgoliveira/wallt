import { Platform } from "react-native";

/**
 * Small string storage for security settings. On Android/iOS it is the platform secure store (Keystore-backed,
 * encrypted at rest); on web, `localStorage` (web has no app lock, only the remembered privacy mode).
 */
type SecureStoreModule = typeof import("expo-secure-store");

function secure(): SecureStoreModule {
  // Lazy so web bundles never load the native module.
  return require("expo-secure-store") as SecureStoreModule;
}

export async function kvGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    return await secure().getItemAsync(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
    else await secure().setItemAsync(key, value);
  } catch {
    // storage unavailable: the setting stays in memory for this session
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
    else await secure().deleteItemAsync(key);
  } catch {
    // nothing to delete
  }
}
