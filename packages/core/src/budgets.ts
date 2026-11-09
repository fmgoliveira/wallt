import { addDays, type CalendarDate, diffDays, endOfMonth, startOfMonth, weekday } from "./dates";
import type { Budget } from "./schemas-extra";

/**
 * Budget math (PLAN §1.3). Pure integer arithmetic on minor units, no IO.
 *
 * Conventions:
 * - Only expenses count: callers pass expense entries (transfers and rows excluded from reports are left out
 *   by the data layer; split transactions are expanded into one entry per split). `amount` is signed, so
 *   spending is negative and a refund inside a budget scope is positive.
 * - Entries must already be in the budget's currency (the data layer converts, see P4.5).
 * - A scope dimension with an empty list means "no restriction". Dimensions combine with AND; within
 *   `categoryIds` / `tagIds` / `accountIds` any match counts.
 * - Rollover (month / week budgets only): unspent allowance carries into the next period; an overspend does
 *   NOT shrink the next period (the carry never goes below zero).
 */

export interface BudgetEntry {
  date: CalendarDate;
  /** Signed minor units in the budget's currency. */
  amount: number;
  categoryId: string | null;
  accountId: string;
  tagIds: readonly string[];
}

export type BudgetShape = Pick<
  Budget,
  "period" | "start" | "end" | "amount" | "rollover" | "scope"
>;

export interface BudgetPeriod {
  from: CalendarDate;
  to: CalendarDate;
}

export type BudgetLevel = "ok" | "warning" | "over";
export type BudgetState = "upcoming" | "active" | "ended";

export const BUDGET_WARNING_PERCENT = 80;
export const BUDGET_OVER_PERCENT = 100;

/** Hard cap on rollover chains (10 years of weeks) so a bad `start` can never loop for long. */
const MAX_PERIODS = 520;

/** The budget's period containing `date`, clipped to the budget's own start/end; null when outside them. */
export function budgetPeriodAt(
  budget: Pick<BudgetShape, "period" | "start" | "end">,
  date: CalendarDate,
): BudgetPeriod | null {
  if (date < budget.start || (budget.end !== null && date > budget.end)) return null;
  if (budget.period === "custom") {
    return budget.end === null ? null : { from: budget.start, to: budget.end };
  }
  let from: CalendarDate;
  let to: CalendarDate;
  if (budget.period === "month") {
    from = startOfMonth(date);
    to = endOfMonth(date);
  } else {
    from = addDays(date, -weekday(date));
    to = addDays(from, 6);
  }
  if (from < budget.start) from = budget.start;
  if (budget.end !== null && to > budget.end) to = budget.end;
  return { from, to };
}

/** Whether an entry falls inside the budget's scope (period not checked). */
export function entryInScope(scope: BudgetShape["scope"], entry: BudgetEntry): boolean {
  if (scope.categoryIds.length > 0) {
    if (entry.categoryId === null || !scope.categoryIds.includes(entry.categoryId)) return false;
  }
  if (scope.accountIds.length > 0 && !scope.accountIds.includes(entry.accountId)) return false;
  if (scope.tagIds.length > 0 && !entry.tagIds.some((id) => scope.tagIds.includes(id)))
    return false;
  return true;
}

/**
 * A scope's category ids plus all their descendants, so budgeting "Food" also covers "Food > Groceries".
 * Ids unknown to `categories` are kept as they are.
 */
export function expandCategoryIds(
  ids: readonly string[],
  categories: readonly { id: string; parentId: string | null }[],
): string[] {
  if (ids.length === 0) return [];
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId !== null && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}

/** Money spent in the scope during `period` (positive number; refunds reduce it, never below zero). */
export function spentInPeriod(
  scope: BudgetShape["scope"],
  entries: readonly BudgetEntry[],
  period: BudgetPeriod,
): number {
  let total = 0;
  for (const e of entries) {
    if (e.date < period.from || e.date > period.to) continue;
    if (entryInScope(scope, e)) total -= e.amount;
  }
  return Math.max(0, total);
}

export interface BudgetStatus {
  state: BudgetState;
  period: BudgetPeriod;
  /** Base amount for the period, before the rollover carry. */
  amount: number;
  /** Unspent allowance carried in from earlier periods (0 without rollover). */
  carry: number;
  /** `amount + carry`. */
  allowance: number;
  spent: number;
  /** `allowance - spent`; negative when overspent. */
  remaining: number;
  /** Whole percent of the allowance spent (floored); 0 when nothing is spent. Capped at 999 for display. */
  percent: number;
  level: BudgetLevel;
  /** Days left in the period including `today` (0 once ended). */
  daysLeft: number;
  /** `remaining / daysLeft` rounded down, 0 when overspent or the period is over. */
  safeToSpendPerDay: number;
}

function percentOf(spent: number, allowance: number): number {
  if (spent <= 0) return 0;
  if (allowance <= 0) return 999;
  return Math.min(999, Math.floor((spent * 100) / allowance));
}

export function levelFor(percent: number): BudgetLevel {
  if (percent >= BUDGET_OVER_PERCENT) return "over";
  if (percent >= BUDGET_WARNING_PERCENT) return "warning";
  return "ok";
}

/** The periods from the budget's first one up to and including the one holding `date`. */
function periodsThrough(budget: BudgetShape, date: CalendarDate): BudgetPeriod[] {
  const out: BudgetPeriod[] = [];
  let cursor = budget.start;
  while (cursor <= date && out.length < MAX_PERIODS) {
    const p = budgetPeriodAt(budget, cursor);
    if (!p) break;
    out.push(p);
    cursor = addDays(p.to, 1);
  }
  return out;
}

/**
 * Where a budget stands on `today`. Before `start` it reports the first period as `upcoming`; after `end` the
 * last one as `ended`. `entries` need to cover every period from `start` when `rollover` is on, otherwise only
 * the current period (extra entries are ignored). Returns null for a custom budget without an end date.
 */
export function budgetStatus(
  budget: BudgetShape,
  entries: readonly BudgetEntry[],
  today: CalendarDate,
  scopeCategoryIds: readonly string[] = budget.scope.categoryIds,
): BudgetStatus | null {
  let state: BudgetState = "active";
  let at = today;
  if (today < budget.start) {
    state = "upcoming";
    at = budget.start;
  } else if (budget.end !== null && today > budget.end) {
    state = "ended";
    at = budget.end;
  }
  const period = budgetPeriodAt(budget, at);
  if (!period) return null;

  const scope = { ...budget.scope, categoryIds: [...scopeCategoryIds] };
  let carry = 0;
  if (budget.rollover && budget.period !== "custom") {
    for (const prior of periodsThrough(budget, at)) {
      if (prior.from === period.from) break;
      carry = Math.max(0, budget.amount + carry - spentInPeriod(scope, entries, prior));
    }
  }

  const allowance = budget.amount + carry;
  const spent = state === "upcoming" ? 0 : spentInPeriod(scope, entries, period);
  const remaining = allowance - spent;
  const percent = percentOf(spent, allowance);
  const daysLeft = state === "active" ? diffDays(today, period.to) + 1 : 0;
  return {
    state,
    period,
    amount: budget.amount,
    carry,
    allowance,
    spent,
    remaining,
    percent,
    level: levelFor(percent),
    daysLeft,
    safeToSpendPerDay: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
  };
}

/** Earliest date whose entries `budgetStatus` needs: the budget start with rollover, else the current period start. */
export function entriesNeededFrom(budget: BudgetShape, today: CalendarDate): CalendarDate | null {
  if (budget.rollover && budget.period !== "custom") return budget.start;
  const at =
    today < budget.start ? budget.start : budget.end && today > budget.end ? budget.end : today;
  return budgetPeriodAt(budget, at)?.from ?? null;
}

/** Stable key of a budget alert (one per budget, period and threshold) used to avoid repeating notifications. */
export function budgetAlertKey(budgetId: string, period: BudgetPeriod, level: "warning" | "over") {
  return `budget:${budgetId}:${period.from}:${level}`;
}
