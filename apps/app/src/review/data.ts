import {
  buildPayeeMemory,
  type CategorizeContext,
  conditionsFromTransaction,
  type Suggestion,
  suggestCategories,
} from "@wallt/categorize";
import type { Transaction } from "@wallt/core";
import { queryKeys, useRepoMutation, useRepoQuery } from "../data/hooks";
import { applyRulesToHistory, historyTxOf } from "../rules/data";
import { getModel } from "../sync/ml";
import { getDeviceMeta } from "../sync/runtime";

export interface ReviewItem {
  tx: Transaction;
  /** Best first: rule, remembered payee, then the model's ranking. */
  suggestions: Suggestion[];
}

/** Most items the queue loads at once; the rest follow as these are answered. */
const QUEUE_LIMIT = 500;

/**
 * Rules, payee memory and the model, loaded once per session (and after a rule is added): they are expensive to
 * build (the memory reads every transaction) and do not change while the queue is being worked through.
 */
const useReviewContext = () =>
  useRepoQuery(["review-context"], async (r): Promise<CategorizeContext> => {
    const [rules, categories, history, model] = await Promise.all([
      r.rules.list(),
      r.categories.list({ includeArchived: true }),
      r.transactions.list({ limit: 60000 }),
      getModel(getDeviceMeta()),
    ]);
    const kinds = new Map(categories.map((c) => [c.id, c.type] as const));
    return {
      rules,
      memory: buildPayeeMemory(history.map(historyTxOf)),
      model,
      categoryKind: (id) => kinds.get(id),
    };
  });

/** Transactions waiting for a person, newest first, each with suggested categories. */
export function useReviewQueue() {
  const context = useReviewContext();
  const queue = useRepoQuery([...queryKeys.transactions, "review-queue"], (r) =>
    r.transactions.list({ needsReview: true, limit: QUEUE_LIMIT }),
  );
  const ctx = context.data;
  const items: ReviewItem[] | undefined =
    queue.data && ctx
      ? queue.data
          .filter((tx) => tx.kind !== "transfer")
          .map((tx) => ({
            tx,
            suggestions: suggestCategories(
              {
                payee: tx.payee,
                description: tx.descriptionClean || tx.descriptionRaw,
                descriptionRaw: tx.descriptionRaw,
                amount: tx.amount,
                accountId: tx.accountId,
                bookingDate: tx.bookingDate,
              },
              ctx,
            ),
          }))
      : undefined;
  return { items, isPending: queue.isPending || context.isPending, isError: queue.isError };
}

/** The user picks a category: it becomes a label (`method: user`), which is also training data. */
export const useAssignCategory = () =>
  useRepoMutation("transactions", (r, input: { id: string; categoryId: string }) =>
    r.transactions.update(input.id, { categoryId: input.categoryId }),
  );

/** "Looks fine": clears the flag and leaves the category (or lack of one) as it is. */
export const useKeepAsIs = () =>
  useRepoMutation("transactions", (r, tx: Transaction) =>
    r.transactions.update(tx.id, { categorization: { ...tx.categorization, needsReview: false } }),
  );

/**
 * "Always categorise this payee as this category": answers the transaction, adds a rule for the payee and applies it
 * to the other transactions it now matches (never over a category the user chose). Returns how many others it fixed.
 */
export const useAlwaysCategorize = () => {
  const mutation = useRepoMutation(
    "rules",
    async (r, input: { tx: Transaction; categoryId: string }) => {
      const { tx, categoryId } = input;
      return r.transaction(async (t) => {
        const name = tx.payee.trim() || tx.descriptionClean.trim() || "New rule";
        const existing = (await t.rules.list()).find(
          (rule) => rule.name === name && rule.action.categoryId === categoryId,
        );
        if (!existing) {
          await t.rules.create({
            name,
            conditions: conditionsFromTransaction({
              payee: tx.payee,
              description: tx.descriptionClean || tx.descriptionRaw,
              amount: tx.amount,
            }),
            action: { categoryId },
          });
        }
        await t.transactions.update(tx.id, { categoryId });
        return applyRulesToHistory(t);
      });
    },
  );
  return mutation;
};
