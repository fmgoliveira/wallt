import { Card, IconTile, ListItem, useTheme } from "@wallt/ui";
import { type Href, useRouter } from "expo-router";
import { moreItems } from "../../src/shell/nav";
import { Page } from "../../src/shell/Page";

/** Phone-only overflow destination: the items that do not fit in the tab bar. */
export default function More() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Page title="More">
      <Card className="overflow-hidden p-0 tablet:p-0">
        {moreItems.map((item, i) => (
          <ListItem
            key={item.key}
            title={item.label}
            divider={i > 0}
            onPress={() => router.push(item.href as Href)}
            leading={
              <IconTile>
                <item.icon size={18} color={colors.muted} strokeWidth={1.6} />
              </IconTile>
            }
          />
        ))}
      </Card>
    </Page>
  );
}
