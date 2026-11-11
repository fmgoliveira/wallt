import { Card, IconTile, ListItem, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, FileSpreadsheet, ListFilter, Tags, UserRound } from "lucide-react-native";
import { useTranslation } from "../../src/i18n";
import { LanguageSetting } from "../../src/i18n/LanguageSetting";
import { NotificationSetting } from "../../src/notifications/NotificationSettings";
import { CategorizationSettings } from "../../src/review/CategorizationSettings";
import { LockSetting, PrivacySetting } from "../../src/security/SecuritySettings";
import { Page } from "../../src/shell/Page";
import { SyncSetting } from "../../src/sync/SyncSettings";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Page title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <LanguageSetting />
      <SyncSetting />
      <NotificationSetting />
      <PrivacySetting />
      <LockSetting />
      <CategorizationSettings />
      <Card className="p-0 tablet:p-0">
        <ListItem
          title={t("settings.categories")}
          subtitle={t("settings.categoriesHint")}
          leading={
            <IconTile>
              <Tags size={18} color={colors.muted} strokeWidth={1.6} />
            </IconTile>
          }
          trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
          onPress={() => router.push("/categories")}
        />
        <ListItem
          title={t("settings.rules")}
          subtitle={t("settings.rulesHint")}
          divider
          leading={
            <IconTile>
              <ListFilter size={18} color={colors.muted} strokeWidth={1.6} />
            </IconTile>
          }
          trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
          onPress={() => router.push("/rules")}
        />
        <ListItem
          title={t("settings.payeeNames")}
          subtitle={t("settings.payeeNamesHint")}
          divider
          leading={
            <IconTile>
              <UserRound size={18} color={colors.muted} strokeWidth={1.6} />
            </IconTile>
          }
          trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
          onPress={() => router.push("/payee-names")}
        />
        <ListItem
          title={t("settings.importFormats")}
          subtitle={t("settings.importFormatsHint")}
          divider
          leading={
            <IconTile>
              <FileSpreadsheet size={18} color={colors.muted} strokeWidth={1.6} />
            </IconTile>
          }
          trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
          onPress={() => router.push("/import-formats")}
        />
      </Card>
    </Page>
  );
}
