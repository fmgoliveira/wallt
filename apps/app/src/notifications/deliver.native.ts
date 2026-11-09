import type { AppNotification } from "@wallt/core";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** Android: system notifications (local, nothing leaves the device). */
export const systemNotifications = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHANNEL = "default";
const REMINDER_PREFIX = "reminder:";

async function ensureChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Wallt",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function permissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Asks the system for permission (shows the dialog the first time). */
export async function requestPermission(): Promise<boolean> {
  try {
    if (await permissionGranted()) return true;
    await ensureChannel();
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Shows one notification now (no-op without permission). */
export async function show(n: AppNotification): Promise<void> {
  try {
    if (!(await permissionGranted())) return;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: n.key,
      content: { title: n.title, body: n.body },
      trigger: null,
    });
  } catch {
    // a failed system notification must never break the app; the in-app feed still has it
  }
}

/** 09:00 local on a `YYYY-MM-DD` date. */
function morningOf(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

/**
 * Keeps one 09:00 reminder scheduled for each upcoming bill (identifier = the notification key, so re-running is
 * idempotent) and cancels reminders for bills that were posted, skipped, paused or deleted.
 */
export async function syncBillReminders(bills: readonly AppNotification[], now = new Date()) {
  try {
    if (!(await permissionGranted())) return;
    await ensureChannel();
    const wanted = new Map<string, AppNotification>(
      bills
        .filter((b) => b.dueDate && morningOf(b.dueDate) > now)
        .map((b): [string, AppNotification] => [`${REMINDER_PREFIX}${b.key}`, b]),
    );
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const have = new Set<string>();
    for (const s of scheduled) {
      if (!s.identifier.startsWith(REMINDER_PREFIX)) continue;
      if (wanted.has(s.identifier)) have.add(s.identifier);
      else await Notifications.cancelScheduledNotificationAsync(s.identifier);
    }
    for (const [identifier, b] of wanted) {
      if (have.has(identifier) || !b.dueDate) continue;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: b.title.replace(/ (is due|is overdue).*$/, " is due today"),
          body: b.body,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: morningOf(b.dueDate),
        },
      });
    }
  } catch {
    // best effort
  }
}
