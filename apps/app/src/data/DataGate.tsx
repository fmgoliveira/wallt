import { Card, Skeleton, Text } from "@wallt/ui";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useDataState } from "./RepositoryProvider";

/** Renders children once the data source is ready; shows a skeleton while opening and the reason if it failed. */
export function DataGate({ children }: { children: ReactNode }) {
  const state = useDataState();
  if (state.status === "ready") return <>{children}</>;
  if (state.status === "error") {
    return (
      <Card className="gap-1">
        <Text variant="title">Cannot open your data</Text>
        <Text tone="muted">{state.error.message}</Text>
      </Card>
    );
  }
  return (
    <Card className="gap-3">
      <Skeleton className="h-5 w-1/3" />
      <View className="gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </View>
    </Card>
  );
}
