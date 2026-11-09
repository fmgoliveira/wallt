import { Card, IconTile, ListItem, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, FileSpreadsheet, ListFilter, Tags, UserRound } from "lucide-react-native";
import { NotificationSetting } from "../../src/notifications/NotificationSettings";
import { CategorizationSettings } from "../../src/review/CategorizationSettings";
import { LockSetting, PrivacySetting } from "../../src/security/SecuritySettings";
import { Page } from "../../src/shell/Page";
import { SyncSetting } from "../../src/sync/SyncSettings";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Page
      title="Settings"
      subtitle="Security, categories, rules; theme, currency and backups later"
    >
      <SyncSetting />
      <NotificationSetting />
      <PrivacySetting />
      <LockSetting />
      <CategorizationSettings />
      <Card className="p-0 tablet:p-0">
        <ListItem
          title="Categories"
          subtitle="Names, icons, colours and order"
          leading={
            <IconTile>
              <Tags size={18} color={colors.muted} strokeWidth={1.6} />
            </IconTile>
          }
          trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
          onPress={() => router.push("/categories")}
        />
        <ListItem
          title="Rules"
          subtitle="Categorise transactions automatically"
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
          title="Payee names"
          subtitle="Clean up how shops and people are named"
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
          title="Import formats"
          subtitle="How each bank's export is read"
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
