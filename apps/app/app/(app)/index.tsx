import { Card, HeroCard, Skeleton, Text } from "@wallt/ui";
import { View } from "react-native";
import { Page } from "../../src/shell/Page";

export default function Dashboard() {
  return (
    <Page title="Dashboard" subtitle="Your money at a glance">
      <HeroCard>
        <Text variant="caption" tone="onHero" className="opacity-80">
          NET WORTH
        </Text>
        <Text variant="display" tone="onHero" tabular>
          — €
        </Text>
        <Text variant="small" tone="onHero" className="opacity-90">
          Add an account to get started
        </Text>
      </HeroCard>
      <View className="gap-4 tablet:flex-row">
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
