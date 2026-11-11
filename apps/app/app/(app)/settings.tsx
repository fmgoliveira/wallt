import { Card, IconTile, ListItem, Text, useBreakpoint, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, FileSpreadsheet, ListFilter, Tags, UserRound } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { DataSetting } from "../../src/data-tools/DataSettings";
import { useTranslation } from "../../src/i18n";
import { LanguageSetting } from "../../src/i18n/LanguageSetting";
import { NotificationSetting } from "../../src/notifications/NotificationSettings";
import { CategorizationSettings } from "../../src/review/CategorizationSettings";
import { LockSetting, PrivacySetting } from "../../src/security/SecuritySettings";
import { Page } from "../../src/shell/Page";
import { SyncSetting } from "../../src/sync/SyncSettings";

/** A titled group of settings cards; on tablet+ the cards sit side by side. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted" accessibilityRole="header" className="px-1 uppercase">
        {title}
      </Text>
      <View className="gap-4">{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bp = useBreakpoint();
  const wide = bp !== "phone";
  const chevron = <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />;
  const links = [
    { key: "categories", icon: Tags, href: "/categories" },
    { key: "rules", icon: ListFilter, href: "/rules" },
    { key: "payeeNames", icon: UserRound, href: "/payee-names" },
    { key: "importFormats", icon: FileSpreadsheet, href: "/import-formats" },
  ] as const;

  return (
    <Page title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <Section title={t("settings.sectionPreferences")}>
        <View className={wide ? "flex-row items-start gap-4" : "gap-4"}>
          <View className="flex-1 gap-4">
            <LanguageSetting />
            <NotificationSetting />
          </View>
          <View className="flex-1 gap-4">
            <SyncSetting />
          </View>
        </View>
      </Section>

      <Section title={t("settings.sectionSecurity")}>
        <View className={wide ? "flex-row items-start gap-4" : "gap-4"}>
          <View className="flex-1 gap-4">
            <PrivacySetting />
          </View>
          <View className="flex-1 gap-4">
            <LockSetting />
          </View>
        </View>
      </Section>

      <Section title={t("settings.sectionOrganise")}>
        <Card className="p-0 tablet:p-0">
          {links.map(({ key, icon: Icon, href }, i) => (
            <ListItem
              key={key}
              title={t(`settings.${key}`)}
              subtitle={t(`settings.${key}Hint`)}
              divider={i > 0}
              leading={
                <IconTile>
                  <Icon size={18} color={colors.muted} strokeWidth={1.6} />
                </IconTile>
              }
              trailing={chevron}
              onPress={() => router.push(href)}
            />
          ))}
        </Card>
        <CategorizationSettings />
      </Section>

      <Section title={t("settings.sectionData")}>
        <DataSetting />
      </Section>
    </Page>
  );
}
