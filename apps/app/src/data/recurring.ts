import {
  addDays,
  detectRecurring,
  fromLocalDate,
  nextOccurrence,
  type RecurringRule,
} from "@wallt/core";
import type { NewRecurringRule, RecurringRulePatch } from "@wallt/db";
import { queryKeys, useRepoMutation, useRepoQuery } from "./hooks";

export const useRecurringRules = (options?: { includeInactive?: boolean }) =>
  useRepoQuery([...queryKeys.recurring, "list", options ?? {}], (r) => r.recurring.list(options));

export const useCreateRecurringRule = () =>
  useRepoMutation("recurring", (r, input: NewRecurringRule) => r.recurring.create(input));
export const useUpdateRecurringRule = () =>
  useRepoMutation("recurring", (r, input: { id: string; patch: RecurringRulePatch }) =>
    r.recurring.update(input.id, input.patch),
  );
export const useDeleteRecurringRule = () =>
  useRepoMutation("recurring", (r, id: string) => r.recurring.delete(id));

/** Patch that moves a rule past `date`: the next occurrence, or paused once the rule has ended. */
export function advancePatch(rule: RecurringRule, date: string): RecurringRulePatch {
  const next = nextOccurrence(rule.rrule, date);
  return next ? { nextDate: next } : { active: false };
}

/** Stable id of one occurrence, stored as the posted transaction's `externalId` so it is never posted twice. */
export const occurrenceKey = (ruleId: string, date: string) => `recurring:${ruleId}:${date}`;

/**
 * Posts the rule's due occurrence (`rule.nextDate`) as a real transaction and advances the rule, atomically.
 * Nothing is ever posted automatically: this runs only when the user taps "Post". If a transaction for that
 * occurrence already exists (for example posted on another device and synced) it is not created again.
 */
export const usePostOccurrence = () =>
  useRepoMutation("recurring", async (r, rule: RecurringRule) =>
    r.transaction(async (tx) => {
      const date = rule.nextDate;
      const key = occurrenceKey(rule.id, date);
      const same = await tx.transactions.list({
        accountIds: [rule.template.accountId],
        from: date,
        to: date,
        limit: 500,
      });
      if (!same.some((t) => t.externalId === key)) {
        const { amount, currency, accountId, categoryId, payee } = rule.template;
        await tx.transactions.create({
          accountId,
          amount,
          currency,
          bookingDate: date,
          payee,
          categoryId,
          kind: amount < 0 ? "expense" : "income",
          source: "manual",
          externalId: key,
        });
      }
      await tx.recurring.update(rule.id, advancePatch(rule, date));
    }),
  );

/** Moves the rule past its due occurrence without posting anything. */
export const useSkipOccurrence = () =>
  useRepoMutation("recurring", (r, rule: RecurringRule) =>
    r.recurring.update(rule.id, advancePatch(rule, rule.nextDate)),
  );

/** Auto-detected recurring charges from the last ~18 months of history (suggestions only, never saved). */
export const useRecurringSuggestions = (today: string) =>
  useRepoQuery([...queryKeys.recurring, "suggestions", today], async (r) => {
    const from = addDays(today, -550);
    const history = await r.transactions.list({ from, limit: 10_000 });
    const rules = await r.recurring.list({ includeInactive: true });
    return detectRecurring(
      history.map((t) => ({
        date: t.bookingDate,
        amount: t.amount,
        currency: t.currency,
        payee: t.payee,
        accountId: t.accountId,
        categoryId: t.categoryId,
        kind: t.kind,
      })),
      today,
      rules.map((x) => ({ payee: x.template.payee, accountId: x.template.accountId })),
    );
  });

export const todayDate = () => fromLocalDate(new Date());
