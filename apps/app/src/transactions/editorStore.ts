import { create } from "zustand";

interface EditorState {
  open: boolean;
  /** Transaction being edited (either leg of a transfer), or null for a new one. */
  txId: string | null;
  /** Account to preselect for a new transaction (e.g. when opened from an account). */
  presetAccountId: string | null;
  /** Last account a transaction was saved to: the default for the next one (fast add). */
  lastAccountId: string | null;
  openNew: (accountId?: string) => void;
  openEdit: (id: string) => void;
  close: () => void;
  remember: (accountId: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  open: false,
  txId: null,
  presetAccountId: null,
  lastAccountId: null,
  openNew: (accountId) => set({ open: true, txId: null, presetAccountId: accountId ?? null }),
  openEdit: (id) => set({ open: true, txId: id, presetAccountId: null }),
  close: () => set({ open: false, txId: null, presetAccountId: null }),
  remember: (accountId) => set({ lastAccountId: accountId }),
}));
