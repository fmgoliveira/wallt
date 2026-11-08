import { create } from "zustand";

interface ShellState {
  /** Desktop sidebar collapsed to icons only. */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const KEY = "wallt.sidebar.collapsed";

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useShellStore = create<ShellState>((set, get) => ({
  collapsed: false,
  toggleCollapsed: () => {
    const next = !get().collapsed;
    set({ collapsed: next });
    try {
      globalThis.localStorage?.setItem(KEY, next ? "1" : "0");
    } catch {
      // storage unavailable: keep in memory
    }
  },
}));

/** Call from an effect after mount (keeps static HTML and first client render identical). */
export function hydrateShellStore(): void {
  useShellStore.setState({ collapsed: read() });
}
