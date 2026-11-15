import type { NotificationType } from "@wallt/core";
import { Card, Switch, Text, toast } from "@wallt/ui";
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
      <View className="gap-1">
        {rows.map((r) => (
          <Switch
            key={r.type}
            label={t(r.title)}
            description={t(r.hint)}
            value={!!prefs[r.type]}
            onValueChange={(on) => void change(r.type, on)}
          />
        ))}
      </View>
    </Card>
  );
}
