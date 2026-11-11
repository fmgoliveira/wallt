import type { NotificationType } from "@wallt/core";
import { Card, Tabs, Text, toast } from "@wallt/ui";
import { useEffect } from "react";
import { View } from "react-native";
import { useTranslation } from "../i18n";
import { permissionGranted, requestPermission, systemNotifications } from "./deliver";
import { useNotificationStore } from "./store";

const rows = [
  {
    type: "budget",
    title: "notifications.settings.budgetTitle",
    hint: "notifications.settings.budgetHint",
  },
  {
    type: "bill",
    title: "notifications.settings.billTitle",
    hint: "notifications.settings.billHint",
  },
  {
    type: "review",
    title: "notifications.settings.reviewTitle",
    hint: "notifications.settings.reviewHint",
  },
] as const satisfies readonly { type: NotificationType; title: string; hint: string }[];

/** Per-type toggles. On Android turning one on also asks the system for permission. */
export function NotificationSetting() {
  const { prefs, setPref, load } = useNotificationStore();
  const { t } = useTranslation();
  const onOff = [
    { value: "off", label: t("notifications.off") },
    { value: "on", label: t("notifications.on") },
  ] as const;
  useEffect(() => {
    void load();
  }, [load]);

  async function change(type: NotificationType, on: boolean) {
    if (on && systemNotifications && !(await permissionGranted())) {
      if (!(await requestPermission())) {
        toast.error(t("notifications.settings.permissionDenied"));
      }
    }
    setPref(type, on);
  }

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text variant="title">{t("notifications.settings.title")}</Text>
        <Text variant="small" tone="muted">
          {systemNotifications
            ? t("notifications.settings.hintSystem")
            : t("notifications.settings.hintWeb")}
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.type} className="gap-1.5">
          <Text weight="medium">{t(r.title)}</Text>
          <Text variant="small" tone="muted">
            {t(r.hint)}
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
