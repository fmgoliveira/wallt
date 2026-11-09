import { type CalendarDate, diffDays } from "./dates";
import type { Debt, Goal } from "./schemas-extra";

/**
 * Goal and debt progress (PLAN §1.3). Always derived from data (account balances, linked repayments): there is no
 * stored "saved so far", so progress can never drift or conflict during sync. Integer minor units, no IO.
 */

export interface GoalAccount {
  id: string;
  currency: string;
  /** Derived balance in minor units. */
  balance: number;
}

export type GoalState = "reached" | "active" | "overdue";

export interface GoalProgress {
  state: GoalState;
  /** Sum of the linked accounts' balances in the goal's currency, never below zero. */
  saved: number;
  remaining: number;
  /** Whole percent saved, floored, capped at 100. */
  percent: number;
  /** Linked accounts in another currency: left out until FX conversion is applied by the caller. */
  ignoredAccounts: number;
  /** Days until the deadline (negative once passed); null without a deadline. */
  daysLeft: number | null;
  /** To reach the target by the deadline, rounded up; 0 when reached, overdue or without a deadline. */
  neededPerMonth: number;
}

const DAYS_PER_MONTH = 30;

export function goalProgress(
  goal: Pick<Goal, "targetAmount" | "currency" | "deadline" | "accountIds">,
  accounts: readonly GoalAccount[],
  today: CalendarDate,
): GoalProgress {
  let saved = 0;
  let ignored = 0;
  for (const id of new Set(goal.accountIds)) {
    const account = accounts.find((a) => a.id === id);
    if (!account) continue;
    if (account.currency === goal.currency) saved += account.balance;
    else ignored += 1;
  }
  saved = Math.max(0, saved);
  const remaining = Math.max(0, goal.targetAmount - saved);
  const percent = Math.min(100, Math.floor((saved * 100) / goal.targetAmount));
  const daysLeft = goal.deadline === null ? null : diffDays(today, goal.deadline);
  const reached = remaining === 0;
  const state: GoalState = reached
    ? "reached"
    : daysLeft !== null && daysLeft < 0
      ? "overdue"
      : "active";
  const months = daysLeft === null || daysLeft <= 0 ? 0 : Math.ceil(daysLeft / DAYS_PER_MONTH);
  return {
    state,
    saved,
    remaining,
    percent,
    ignoredAccounts: ignored,
    daysLeft,
    neededPerMonth: state === "active" && months > 0 ? Math.ceil(remaining / months) : 0,
  };
}

export interface DebtProgress {
  /** Repaid so far, as given (derived from linked transactions). */
  repaid: number;
  /** What is still owed; zero once fully repaid. */
  outstanding: number;
  /** Repaid beyond the debt amount. */
  overpaid: number;
  /** Whole percent repaid, floored, capped at 100. */
  percent: number;
  /** Marked settled by the user, or fully repaid. */
  settled: boolean;
  /** Fully repaid but not yet marked settled: the UI offers to settle it. */
  canSettle: boolean;
}

export function debtProgress(debt: Pick<Debt, "amount" | "settled">, repaid: number): DebtProgress {
  const paid = Math.max(0, repaid);
  const fully = paid >= debt.amount;
  return {
    repaid: paid,
    outstanding: Math.max(0, debt.amount - paid),
    overpaid: Math.max(0, paid - debt.amount),
    percent: Math.min(100, Math.floor((paid * 100) / debt.amount)),
    settled: debt.settled || fully,
    canSettle: fully && !debt.settled,
  };
}
