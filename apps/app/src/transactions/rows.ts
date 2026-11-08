import type { Transaction } from "@wallt/core";
import { useMemo } from "react";
import { useAccounts, useCategories } from "../data/hooks";

export interface TxRow {
  tx: Transaction;
  id: string;
  title: string;
  accountName: string;
  /** Null when uncategorised (and for transfers). */
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  transfer: boolean;
}

/** Joins transactions with their account and category names (both tables are small and already cached). */
export function useTxRows(txs: readonly Transaction[]): TxRow[] {
  const accounts = useAccounts({ includeArchived: true }).data;
  const categories = useCategories({ includeArchived: true }).data;
  return useMemo(() => {
    const acc = new Map((accounts ?? []).map((a) => [a.id, a.name]));
    const cat = new Map((categories ?? []).map((c) => [c.id, c]));
    return txs.map((tx) => {
      const c = tx.categoryId ? cat.get(tx.categoryId) : undefined;
      const transfer = tx.kind === "transfer";
      return {
        tx,
        id: tx.id,
        title: transfer
          ? "Transfer"
          : tx.payee || tx.descriptionClean || tx.descriptionRaw || c?.name || "Transaction",
        accountName: acc.get(tx.accountId) ?? "",
        categoryName: c?.name ?? null,
        categoryColor: c?.color ?? null,
        categoryIcon: c?.icon ?? null,
        transfer,
      };
    });
  }, [txs, accounts, categories]);
}

/** Day header text, e.g. "Mon, 4 Nov". `YYYY-MM-DD` is read as a calendar date, never shifted by time zone. */
export function dayLabel(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
