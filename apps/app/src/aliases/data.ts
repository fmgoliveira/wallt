import { planPayeeRenames } from "@wallt/categorize";
import type { Repository } from "@wallt/db";
import { useRepoMutation } from "../data/hooks";
import { historyTxOf } from "../rules/data";

/** Rename existing transactions to the payee their first matching alias names. */
export async function applyAliasesToHistory(repo: Repository): Promise<number> {
  const [aliases, txs] = await Promise.all([
    repo.payeeAliases.list(),
    repo.transactions.list({ limit: 60000 }),
  ]);
  const plan = planPayeeRenames(aliases, txs.map(historyTxOf));
  await repo.transaction(async (tx) => {
    for (const p of plan) await tx.transactions.update(p.id, { payee: p.payee });
  });
  return plan.length;
}

export const useApplyAliases = () =>
  useRepoMutation("payeeAliases", (r, _input: undefined) => applyAliasesToHistory(r));
