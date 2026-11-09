import { billNotifications, fromLocalDate, selectNotifications } from "@wallt/core";
import { useEffect } from "react";
import { useBudgetStatuses, useTransactionCount } from "../data/hooks";
import { useRecurringRules } from "../data/recurring";
import { permissionGranted, show, syncBillReminders } from "./deliver";
import { useNotificationStore } from "./store";

/** Reminders are scheduled this far ahead. */
const REMINDER_HORIZON_DAYS = 30;

/**
 * Headless: whenever budgets, recurring rules or the review count change, works out which notifications exist,
 * records the ones this device has not shown (in-app feed) and, on Android, shows them as system notifications.
 */
export function NotificationsRunner() {
  const today = fromLocalDate(new Date());
  const { loaded, prefs, load, ingest } = useNotificationStore();
  const budgets = useBudgetStatuses(today);
  const rules = useRecurringRules();
  const review = useTransactionCount({ needsReview: true });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || !budgets.data || !rules.data || review.data === undefined) return;
    const candidates = selectNotifications({
      budgets: budgets.data,
      rules: rules.data.map((r) => ({ ...r, template: { payee: r.template.payee } })),
      reviewCount: review.data,
      today,
      prefs,
    });
    const fresh = ingest(candidates, new Date().toISOString());
    if (fresh.length > 0) {
      void permissionGranted().then((ok) => {
        if (ok) for (const n of fresh) void show(n);
      });
    }
    void syncBillReminders(
      prefs.bill
        ? billNotifications(
            rules.data.map((r) => ({ ...r, template: { payee: r.template.payee } })),
            today,
            REMINDER_HORIZON_DAYS,
          )
        : [],
    );
  }, [loaded, prefs, budgets.data, rules.data, review.data, today, ingest]);

  return null;
}
