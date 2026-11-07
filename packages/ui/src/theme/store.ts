import { create } from "zustand";
import { type AccentName, accentPalette, type ColorScheme } from "../tokens";

export type SchemePreference = "system" | ColorScheme;

interface ThemeState {
  /** What the user picked; `system` follows the OS. */
  preference: SchemePreference;
  accent: AccentName;
  setPreference: (p: SchemePreference) => void;
  setAccent: (a: AccentName) => void;
  /** Load the persisted choice. Called from an effect so static/SSR output and hydration agree. */
  hydrate: () => void;
}

const STORAGE_KEY = "wallt.theme";

interface Persisted {
  preference: SchemePreference;
  accent: AccentName;
}

function isPreference(v: unknown): v is SchemePreference {
  return v === "system" || v === "light" || v === "dark";
}

function isAccent(v: unknown): v is AccentName {
  return typeof v === "string" && v in accentPalette;
}

/**
 * Web persists to localStorage. On Android the choice is in-memory for now; it moves into the local
 * settings table once the local DB exists (P2.3).
 */
function load(): Persisted {
  const fallback: Persisted = { preference: "system", accent: "indigo" };
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const p = parsed as Record<string, unknown>;
    return {
      preference: isPreference(p.preference) ? p.preference : fallback.preference,
      accent: isAccent(p.accent) ? p.accent : fallback.accent,
    };
  } catch {
    return fallback;
  }
}

function save(state: Persisted): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, native): keep the in-memory value
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: "system",
  accent: "indigo",
  hydrate: () => set(load()),
  setPreference: (preference) => {
    set({ preference });
    save({ preference, accent: get().accent });
  },
  setAccent: (accent) => {
    set({ accent });
    save({ preference: get().preference, accent });
  },
}));
