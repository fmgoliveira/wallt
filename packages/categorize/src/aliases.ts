import type { HistoryTx } from "./rules";

/*
 * Payee aliases (PLAN §5/§6, P6.2): a raw text pattern -> a clean payee name. Same semantics as the import
 * pipeline's `derivePayee` (@wallt/ingest): the pattern is a case-insensitive regular expression tried on the raw
 * and on the cleaned description, or plain text when it is not a valid expression. First match in list order wins.
 */

export interface AliasLike {
  pattern: string;
  payee: string;
}

/** Whether the pattern works as a regular expression, or is treated as plain text. */
export function aliasPatternKind(pattern: string): "regex" | "text" {
  try {
    new RegExp(pattern, "i");
    return "regex";
  } catch {
    return "text";
  }
}

export function aliasMatches(pattern: string, texts: readonly string[]): boolean {
  if (pattern.trim() === "") return false;
  let re: RegExp | null = null;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    // plain text below
  }
  const needle = pattern.toLowerCase();
  return texts.some((t) => (re ? re.test(t) : t.toLowerCase().includes(needle)));
}

const textsOf = (tx: Pick<HistoryTx, "description" | "descriptionRaw">): string[] =>
  tx.descriptionRaw && tx.descriptionRaw !== tx.description
    ? [tx.descriptionRaw, tx.description]
    : [tx.description];

/** The alias that names this transaction, or `null`. */
export function resolveAlias<T extends AliasLike>(
  aliases: readonly T[],
  tx: Pick<HistoryTx, "description" | "descriptionRaw">,
): T | null {
  const texts = textsOf(tx);
  return aliases.find((a) => aliasMatches(a.pattern, texts)) ?? null;
}

export interface AliasPreview {
  /** Transactions the pattern matches. */
  matches: number;
  /** Matches whose payee differs from the alias's. */
  wouldRename: number;
  /** Ids of the first matches. */
  sample: string[];
}

/** "This alias matches 12 transactions, 9 would be renamed": how a (possibly unsaved) alias fares on the history. */
export function previewAlias(
  alias: AliasLike,
  history: readonly HistoryTx[],
  sampleSize = 5,
): AliasPreview {
  const out: AliasPreview = { matches: 0, wouldRename: 0, sample: [] };
  const payee = alias.payee.trim();
  for (const tx of history) {
    if (tx.kind === "transfer" || !aliasMatches(alias.pattern, textsOf(tx))) continue;
    out.matches++;
    if (out.sample.length < sampleSize) out.sample.push(tx.id);
    if (payee !== "" && tx.payee !== payee) out.wouldRename++;
  }
  return out;
}

export interface PayeeRename {
  id: string;
  payee: string;
}

/** Rename existing transactions to the payee their first matching alias names; unchanged ones are left out. */
export function planPayeeRenames(
  aliases: readonly AliasLike[],
  history: readonly HistoryTx[],
): PayeeRename[] {
  const out: PayeeRename[] = [];
  for (const tx of history) {
    if (tx.kind === "transfer") continue;
    const hit = resolveAlias(aliases, tx);
    const payee = hit?.payee.trim();
    if (payee && payee !== tx.payee) out.push({ id: tx.id, payee });
  }
  return out;
}
