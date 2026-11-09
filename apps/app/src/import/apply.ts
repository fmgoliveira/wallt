import type { Transaction } from "@wallt/core";
import { createUuidV7Generator, type Repository } from "@wallt/db";
import {
  type ExistingTx,
  type ImportPlan,
  lookupRange,
  type ParsedRow,
  planImport,
} from "@wallt/ingest";

const newBatchId = createUuidV7Generator();

const existingOf = (t: Transaction): ExistingTx => ({
  id: t.id,
  accountId: t.accountId,
  bookingDate: t.bookingDate,
  amount: t.amount,
  currency: t.currency,
  status: t.status,
  kind: t.kind,
  descriptionRaw: t.descriptionRaw,
  descriptionClean: t.descriptionClean,
  externalId: t.externalId,
  dedupHash: t.dedupHash,
});

/**
 * Plan an import against what the database already holds: the target account's transactions near the file's
 * dates (dedup, pending matching) and the other accounts' (transfer detection). Read-only.
 */
export async function planForAccount(
  repo: Repository,
  accountId: string,
  currency: string,
  rows: readonly ParsedRow[],
): Promise<ImportPlan> {
  const range = lookupRange(rows);
  if (!range) return planImport({ accountId, currency, rows, existing: [] });
  const all = (await repo.transactions.list({ from: range.from, to: range.to, limit: 20000 })).map(
    existingOf,
  );
  return planImport({
    accountId,
    currency,
    rows,
    existing: all.filter((t) => t.accountId === accountId),
    others: all.filter((t) => t.accountId !== accountId),
  });
}

export interface ImportOutcome {
  batchId: string;
  inserted: number;
  /** Pending transactions that became booked instead of being duplicated. */
  updatedPending: number;
  duplicates: number;
  needsReview: number;
  /** Transfers linked automatically (unique, high confidence). */
  linkedTransfers: number;
}

/**
 * Write a plan in one transaction: new rows (stamped with a batch id so the whole import can be undone), pending ->
 * booked updates, and the high-confidence transfer links. Duplicates are skipped, never written.
 */
export function applyPlan(
  repo: Repository,
  plan: ImportPlan,
  currency: string,
): Promise<ImportOutcome> {
  const batchId = newBatchId();
  return repo.transaction(async (tx) => {
    const created = new Map<number, string>(); // plan row index -> new transaction id
    let inserted = 0;
    let updatedPending = 0;
    for (const [i, p] of plan.rows.entries()) {
      const { row } = p;
      if (p.action === "insert") {
        const made = await tx.transactions.create({
          accountId: plan.accountId,
          amount: row.amount,
          currency,
          bookingDate: row.bookingDate,
          valueDate: row.valueDate,
          payee: p.payee,
          descriptionRaw: row.description,
          descriptionClean: p.descriptionClean,
          status: "booked",
          source: "import",
          externalId: row.externalId,
          dedupHash: p.dedupHash,
          importBatchId: batchId,
          needsReview: p.needsReview,
          notes: p.needsReview ? p.reasons.join("; ") : "",
        });
        created.set(i, made.id);
        inserted++;
      } else if (p.action === "update-pending" && p.existingId) {
        await tx.transactions.update(p.existingId, {
          status: "booked",
          bookingDate: row.bookingDate,
          valueDate: row.valueDate,
          externalId: row.externalId,
          dedupHash: p.dedupHash,
        });
        updatedPending++;
      }
    }
    let linkedTransfers = 0;
    const used = new Set<string>();
    for (const t of plan.transfers) {
      const id = created.get(t.rowIndex);
      if (!t.auto || !id || used.has(id) || used.has(t.counterpartId)) continue;
      try {
        await tx.transactions.linkTransfer(id, t.counterpartId);
        used.add(id);
        used.add(t.counterpartId);
        linkedTransfers++;
      } catch {
        // the suggestion went stale (already linked, edited): keep the plain rows
      }
    }
    return {
      batchId,
      inserted,
      updatedPending,
      duplicates: plan.summary.duplicates,
      needsReview: plan.summary.needsReview,
      linkedTransfers,
    };
  });
}
