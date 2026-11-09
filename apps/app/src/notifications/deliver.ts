import type { AppNotification } from "@wallt/core";

/** Web: no system notifications; the in-app notification center is the only surface. */
export const systemNotifications = false;

export async function permissionGranted(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<boolean> {
  return false;
}

export async function show(_n: AppNotification): Promise<void> {}

export async function syncBillReminders(
  _bills: readonly AppNotification[],
  _now?: Date,
): Promise<void> {}
