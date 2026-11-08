import { Card, ListItem } from "@wallt/ui";
import { type Href, useRouter } from "expo-router";
import { moreItems } from "../../src/shell/nav";
import { Page } from "../../src/shell/Page";

/** Phone-only overflow destination: the items that do not fit in the bottom bar. */
export default function More() {
  const router = useRouter();
  return (
    <Page title="More">
      <Card className="overflow-hidden p-0">
        {moreItems.map((item, i) => (
          <ListItem
            key={item.key}
            title={item.label}
            divider={i < moreItems.length - 1}
            onPress={() => router.push(item.href as Href)}
          />
        ))}
      </Card>
    </Page>
  );
}
