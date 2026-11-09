import { debtProgress, type Goal, goalProgress } from "@wallt/core";
import type { DebtPatch, DebtWithProgress, GoalPatch, NewDebt, NewGoal } from "@wallt/db";
import { queryKeys, useAccountsWithBalances, useRepoMutation, useRepoQuery } from "./hooks";

export const useGoals = () => useRepoQuery([...queryKeys.goals, "list"], (r) => r.goals.list());

export const useCreateGoal = () =>
  useRepoMutation("goals", (r, input: NewGoal) => r.goals.create(input));
export const useUpdateGoal = () =>
  useRepoMutation("goals", (r, input: { id: string; patch: GoalPatch }) =>
    r.goals.update(input.id, input.patch),
  );
export const useDeleteGoal = () => useRepoMutation("goals", (r, id: string) => r.goals.delete(id));

/** Every goal with its progress, derived from the linked accounts' current balances. */
export function useGoalsWithProgress(today: string) {
  const goals = useGoals();
  const accounts = useAccountsWithBalances({ includeArchived: true });
  const data =
    goals.data && accounts.data
      ? goals.data.map((goal: Goal) => ({
          goal,
          progress: goalProgress(goal, accounts.data, today),
        }))
      : undefined;
  return { data, isPending: goals.isPending || accounts.isPending };
}

export const useDebts = (options?: { includeSettled?: boolean }) =>
  useRepoQuery([...queryKeys.debts, "list", options ?? {}], (r) => r.debts.list(options));

export const useCreateDebt = () =>
  useRepoMutation("debts", (r, input: NewDebt) => r.debts.create(input));
export const useUpdateDebt = () =>
  useRepoMutation("debts", (r, input: { id: string; patch: DebtPatch }) =>
    r.debts.update(input.id, input.patch),
  );
export const useDeleteDebt = () => useRepoMutation("debts", (r, id: string) => r.debts.delete(id));

export const debtWithProgress = (debt: DebtWithProgress) => ({
  debt,
  progress: debtProgress(debt, debt.repaid),
});

/**
 * Records money received (a debt you lent) or paid (one you borrowed) as a transaction linked to the debt.
 * The account must be in the debt's currency. The repaid total is derived from these transactions.
 */
export const useRecordRepayment = () =>
  useRepoMutation(
    "debts",
    (
      r,
      input: { debt: DebtWithProgress; accountId: string; amount: number; bookingDate: string },
    ) => {
      const { debt } = input;
      const amount = debt.direction === "lent" ? input.amount : -input.amount;
      return r.transactions.create({
        accountId: input.accountId,
        amount,
        currency: debt.currency,
        bookingDate: input.bookingDate,
        payee: debt.person,
        notes: debt.direction === "lent" ? "Repayment received" : "Repayment made",
        kind: amount > 0 ? "income" : "expense",
        source: "manual",
        debtId: debt.id,
      });
    },
  );
