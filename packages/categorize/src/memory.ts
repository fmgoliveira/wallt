import type { HistoryTx } from "./rules";
import { normalizeText } from "./text";

/*
 * Exact payee memory (PLAN §6 step 2): when the user has put the same clean payee in the same category at least
 * twice (and nearly always), the next one goes there too, with confidence 0.95. Only categories the user chose count.
 */

export interface MemoryEntry {
  categoryId: string;
  /** User-categorised transactions of this payee in `categoryId`. */
  count: number;
  /** All user-categorised transactions of this payee. */
  total: number;
}

export type PayeeMemory = ReadonlyMap<string, MemoryEntry>;

export const MEMORY_CONFIDENCE = 0.95;

export function buildPayeeMemory(
  history: readonly Pick<HistoryTx, "payee" | "kind" | "categoryId" | "method">[],
  minCount = 2,
  minShare = 0.8,
): PayeeMemory {
  const perPayee = new Map<string, Map<string, number>>();
  for (const tx of history) {
    if (tx.method !== "user" || !tx.categoryId || tx.kind === "transfer") continue;
    const key = normalizeText(tx.payee);
    if (key === "") continue;
    const cats = perPayee.get(key) ?? new Map<string, number>();
    cats.set(tx.categoryId, (cats.get(tx.categoryId) ?? 0) + 1);
    perPayee.set(key, cats);
  }
  const memory = new Map<string, MemoryEntry>();
  for (const [key, cats] of perPayee) {
    let total = 0;
    let best: [string, number] | null = null;
    for (const [cat, n] of cats) {
      total += n;
      if (!best || n > best[1] || (n === best[1] && cat < best[0])) best = [cat, n];
    }
    if (best && best[1] >= minCount && best[1] / total >= minShare) {
      memory.set(key, { categoryId: best[0], count: best[1], total });
    }
  }
  return memory;
}

export function lookupPayeeMemory(memory: PayeeMemory, payee: string): MemoryEntry | null {
  return memory.get(normalizeText(payee)) ?? null;
}
