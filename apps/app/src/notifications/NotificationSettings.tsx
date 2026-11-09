import type { NotificationType } from "@wallt/core";
import { Card, Tabs, Text, toast } from "@wallt/ui";
import { useEffect } from "react";
import { View } from "react-native";
import { permissionGranted, requestPermission, systemNotifications } from "./deliver";
import { useNotificationStore } from "./store";

const onOff = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
] as const;

const rows: { type: NotificationType; title: string; hint: string }[] = [
  { type: "budget", title: "Budget alerts", hint: "When a budget reaches 80% and 100%." },
  { type: "bill", title: "Upcoming bills", hint: "A few days before a recurring item is due." },
  { type: "review", title: "Review reminders", hint: "Once a day while transactions need review." },
];

/** Per-type toggles. On Android turning one on also asks the system for permission. */
export function NotificationSetting() {
  const { prefs, setPref, load } = useNotificationStore();
  useEffect(() => {
    void load();
  }, [load]);

  async function change(type: NotificationType, on: boolean) {
    if (on && systemNotifications && !(await permissionGranted())) {
      if (!(await requestPermission())) {
        toast.error("Allow notifications for Wallt in the system settings to get alerts.");
      }
    }
    setPref(type, on);
  }

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text variant="title">Notifications</Text>
        <Text variant="small" tone="muted">
          {systemNotifications
            ? "Shown on this device and listed in the bell. They never include amounts."
            : "Listed in the bell at the top of each page."}
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.type} className="gap-1.5">
          <Text weight="medium">{r.title}</Text>
          <Text variant="small" tone="muted">
            {r.hint}
          </Text>
          <Tabs
            items={onOff}
            value={prefs[r.type] ? "on" : "off"}
            onChange={(v) => void change(r.type, v === "on")}
          />
        </View>
      ))}
    </Card>
  );
}
