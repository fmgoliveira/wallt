import {
  DEFAULT_RULE_SPECS,
  defaultRuleConditions,
  type HistoryTx,
  planRecategorization,
} from "@wallt/categorize";
import type { Category, Transaction } from "@wallt/core";
import type { Repository } from "@wallt/db";
import { queryKeys, useRepoMutation, useRepoQuery } from "../data/hooks";

/** The most transactions a rule preview or "apply to history" looks at (PLAN: 10 years is about 50k). */
const HISTORY_LIMIT = 60000;

export const historyTxOf = (t: Transaction): HistoryTx => ({
  id: t.id,
  payee: t.payee,
  description: t.descriptionClean || t.descriptionRaw,
  descriptionRaw: t.descriptionRaw,
  amount: t.amount,
  accountId: t.accountId,
  kind: t.kind,
  categoryId: t.categoryId,
  method: t.categorization.method,
});

/** Every transaction as rule input; loaded only while something (a preview, a button) needs it. */
export const useRuleHistory = (enabled = true) =>
  useRepoQuery([...queryKeys.transactions, "rule-history", enabled], async (r) =>
    enabled ? (await r.transactions.list({ limit: HISTORY_LIMIT })).map(historyTxOf) : [],
  );

export const categoryKindOf = (categories: readonly Category[]) => {
  const byId = new Map(categories.map((c) => [c.id, c.type] as const));
  return (id: string) => byId.get(id);
};

/** Apply the saved rules to existing transactions; categories chosen by the user are never touched. */
export async function applyRulesToHistory(repo: Repository): Promise<number> {
  const [rules, categories, txs] = await Promise.all([
    repo.rules.list(),
    repo.categories.list({ includeArchived: true }),
    repo.transactions.list({ limit: HISTORY_LIMIT }),
  ]);
  const plan = planRecategorization(rules, txs.map(historyTxOf), categoryKindOf(categories));
  await repo.transaction(async (tx) => {
    for (const p of plan) {
      await tx.transactions.update(p.id, {
        categoryId: p.categoryId,
        categorization: { method: "rule", confidence: 1, needsReview: false },
      });
    }
  });
  return plan.length;
}

export const useApplyRules = () =>
  useRepoMutation("rules", (r, _input: undefined) => applyRulesToHistory(r));

/** Adds the cold-start merchant rules that are not there yet (by name) and whose category exists. */
export async function addSuggestedRules(repo: Repository): Promise<number> {
  const [existing, categories] = await Promise.all([
    repo.rules.list(),
    repo.categories.list({ includeArchived: true }),
  ]);
  const names = new Set(existing.map((r) => r.name.toLowerCase()));
  const byKey = new Map(
    categories.filter((c) => c.systemKey && !c.archived).map((c) => [c.systemKey as string, c.id]),
  );
  let added = 0;
  await repo.transaction(async (tx) => {
    for (const spec of DEFAULT_RULE_SPECS) {
      const categoryId = byKey.get(spec.categoryKey);
      if (!categoryId || names.has(spec.name.toLowerCase())) continue;
      await tx.rules.create({
        name: spec.name,
        conditions: defaultRuleConditions(spec),
        action: { categoryId },
      });
      added++;
    }
  });
  return added;
}

export const useAddSuggestedRules = () =>
  useRepoMutation("rules", (r, _input: undefined) => addSuggestedRules(r));
