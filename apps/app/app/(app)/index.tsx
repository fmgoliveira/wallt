import { Amount, Card, HeroCard, Skeleton, Text } from "@wallt/ui";
import { View } from "react-native";
import { Page } from "../../src/shell/Page";

export default function Dashboard() {
  return (
    <Page title="Dashboard" subtitle="Your money at a glance">
      <HeroCard>
        <Text variant="small" tone="onHero" weight="medium" className="opacity-60">
          Net worth
        </Text>
        <View className="my-1.5">
          <Amount value={0} size="display" tone="onHero" ticker />
        </View>
        <Text variant="small" tone="onHero" className="opacity-60">
          Add an account to get started
        </Text>
      </HeroCard>
      <View className="gap-3 tablet:flex-row tablet:gap-4">
        {["This month", "Budgets", "Recent"].map((t) => (
          <Card key={t} className="gap-3 tablet:flex-1">
            <Text variant="title">{t}</Text>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))}
      </View>
    </Page>
  );
}
