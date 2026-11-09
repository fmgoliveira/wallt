import { type BudgetStatus, budgetAlertKey } from "./budgets";
import type { CalendarDate } from "./dates";
import { type RuleLike, upcomingItems } from "./recurrence";

/**
 * Which notifications should exist right now (PLAN §1.3): budget alerts, "N transactions need review" and upcoming
 * bills. Pure. Every notification has a deterministic `key` derived from synced data (budget + period + threshold,
 * rule + due date, calendar day), so two devices compute the same keys: each device remembers the keys it has already
 * shown and never repeats one, and a notification that was already shown on this device is never shown twice.
 * Texts carry no amounts: a lock screen must not leak balances.
 */

export type NotificationType = "budget" | "review" | "bill";

export interface AppNotification {
  key: string;
  type: NotificationType;
  title: string;
  body: string;
  /** For bills: the due date, so a platform can schedule the reminder ahead of time. */
  dueDate?: CalendarDate;
}

export type NotificationPrefs = Record<NotificationType, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  budget: true,
  review: true,
  bill: true,
};

/** Bills are announced this many days before they are due (and while overdue). */
export const BILL_LEAD_DAYS = 3;

export function budgetNotifications(
  items: readonly {
    budget: { id: string; name: string };
    status: Pick<BudgetStatus, "state" | "level" | "period" | "percent"> | null;
  }[],
): AppNotification[] {
  const out: AppNotification[] = [];
  for (const { budget, status } of items) {
    if (status?.state !== "active" || status.level === "ok") continue;
    out.push({
      key: budgetAlertKey(budget.id, status.period, status.level),
      type: "budget",
      title:
        status.level === "over"
          ? `${budget.name} is over budget`
          : `${budget.name} is close to its limit`,
      body: `You have spent ${status.percent}% of this period's budget.`,
    });
  }
  return out;
}

export function billNotifications(
  rules: readonly (RuleLike & { id: string; template: { payee: string } })[],
  today: CalendarDate,
  leadDays = BILL_LEAD_DAYS,
): AppNotification[] {
  return upcomingItems(rules, today, leadDays)
    .filter((i) => i.date === i.rule.nextDate) // later occurrences of an unposted rule are not due yet
    .map((i) => ({
      key: `bill:${i.rule.id}:${i.date}`,
      type: "bill" as const,
      title:
        i.inDays < 0
          ? `${i.rule.template.payee} is overdue`
          : i.inDays === 0
            ? `${i.rule.template.payee} is due today`
            : `${i.rule.template.payee} is due ${i.inDays === 1 ? "tomorrow" : `in ${i.inDays} days`}`,
      body: "Open Recurring to post or skip it.",
      dueDate: i.date,
    }));
}

export function reviewNotification(count: number, today: CalendarDate): AppNotification[] {
  if (count <= 0) return [];
  return [
    {
      // one per day: it must not re-appear after being read, but a new day with a backlog is worth a nudge
      key: `review:${today}`,
      type: "review",
      title: `${count} transaction${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} review`,
      body: "Check the categories we suggested.",
    },
  ];
}

export function selectNotifications(input: {
  budgets: Parameters<typeof budgetNotifications>[0];
  rules: Parameters<typeof billNotifications>[0];
  reviewCount: number;
  today: CalendarDate;
  prefs: NotificationPrefs;
}): AppNotification[] {
  return [
    ...(input.prefs.budget ? budgetNotifications(input.budgets) : []),
    ...(input.prefs.bill ? billNotifications(input.rules, input.today) : []),
    ...(input.prefs.review ? reviewNotification(input.reviewCount, input.today) : []),
  ];
}

/** The candidates this device has not shown yet. */
export function unseen<T extends { key: string }>(
  candidates: readonly T[],
  seen: ReadonlySet<string>,
): T[] {
  const out: T[] = [];
  const taken = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.key) || taken.has(c.key)) continue;
    taken.add(c.key);
    out.push(c);
  }
  return out;
}

export interface FeedItem extends AppNotification {
  /** UTC timestamp the device first showed it. */
  createdAt: string;
  read: boolean;
}

export const FEED_LIMIT = 50;

/** Adds fresh notifications (unread) to the in-app feed: newest first, capped, never duplicating a key. */
export function mergeFeed(
  feed: readonly FeedItem[],
  fresh: readonly AppNotification[],
  now: string,
  limit = FEED_LIMIT,
): FeedItem[] {
  const have = new Set(feed.map((f) => f.key));
  const added = unseen(fresh, have).map((n): FeedItem => ({ ...n, createdAt: now, read: false }));
  return [...added, ...feed].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export const unreadCount = (feed: readonly FeedItem[]) => feed.filter((f) => !f.read).length;

export const markAllRead = (feed: readonly FeedItem[]): FeedItem[] =>
  feed.map((f) => (f.read ? f : { ...f, read: true }));

/**
 * Keys remembered as shown on this device. Old keys are dropped (they embed past periods and days, so they can no
 * longer be produced again), keeping the stored list small.
 */
export function rememberKeys(
  seen: readonly string[],
  shown: readonly string[],
  max = 500,
): string[] {
  return [...new Set([...seen, ...shown])].slice(-max);
}
