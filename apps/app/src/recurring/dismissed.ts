import { create } from "zustand";
import { kvGet, kvSet } from "../security/kv";

const KEY = "wallt.recurring.dismissed";

interface DismissedState {
  keys: string[];
  loaded: boolean;
  load: () => Promise<void>;
  dismiss: (key: string) => void;
}

/** Suggestions the user waved away. Kept per device (a dismissal is a preference, not data worth syncing). */
export const useDismissedSuggestions = create<DismissedState>((set, get) => ({
  keys: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await kvGet(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      set({
        keys: Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  dismiss: (key) => {
    const keys = [...new Set([...get().keys, key])];
    set({ keys });
    void kvSet(KEY, JSON.stringify(keys));
  },
}));
