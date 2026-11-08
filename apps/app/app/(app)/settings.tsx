import { Card, IconTile, ListItem, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, Tags } from "lucide-react-native";
import { Page } from "../../src/shell/Page";

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Page title="Settings" subtitle="Categories now; theme, currency, backups and devices later">
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
