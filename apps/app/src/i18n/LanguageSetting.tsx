import { Card, Tabs, Text } from "@wallt/ui";
import { View } from "react-native";
import { useLanguageStore, useTranslation } from "./index";
import type { LanguagePreference } from "./resolve";

export function LanguageSetting() {
  const { t } = useTranslation();
  const preference = useLanguageStore((s) => s.preference);
  const items = [
    { value: "system", label: t("language.system") },
    { value: "en", label: t("language.en") },
    { value: "pt", label: t("language.pt") },
  ] as const;
  return (
    <Card className="gap-3">
      <View className="gap-1">
        <Text variant="title">{t("language.title")}</Text>
        <Text variant="small" tone="muted">
          {t("language.hint")}
        </Text>
      </View>
      <Tabs
        items={items}
        value={preference}
        onChange={(v) => useLanguageStore.getState().setPreference(v as LanguagePreference)}
      />
    </Card>
  );
}
