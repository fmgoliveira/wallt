import { Card, IconTile, ListItem, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, Tags } from "lucide-react-native";
import { LockSetting, PrivacySetting } from "../../src/security/SecuritySettings";
import { Page } from "../../src/shell/Page";
import { SyncSetting } from "../../src/sync/SyncSettings";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Page title="Settings" subtitle="Security, categories; theme, currency and backups later">
      <SyncSetting />
      <PrivacySetting />
      <LockSetting />
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
      </Card>
    </Page>
  );
}
