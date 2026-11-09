import { create } from "zustand";

interface PrivacyState {
  /** Privacy mode: every `<Amount>` renders `••••` (same width, no layout shift). */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
}

/** In-memory for now; P2.9 wires it to the lock screen and persisted settings. */
export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
  toggle: () => set({ hidden: !get().hidden }),
}));
