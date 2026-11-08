import { Card, ListItem, MasterDetail, Text } from "@wallt/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Page } from "../../src/shell/Page";

// Demo rows only; real data arrives with the repository layer and P2.6/P2.7.
const demo = [
  { id: "1", payee: "Corner Market", meta: "Groceries · 2026-11-04", amount: "-42,30 €" },
  { id: "2", payee: "Acme Payroll", meta: "Salary · 2026-11-03", amount: "2 450,00 €" },
  { id: "3", payee: "City Transit", meta: "Transport · 2026-11-01", amount: "-30,00 €" },
];

export default function Transactions() {
  const router = useRouter();
  // Selection lives in the URL (?id=2): shareable, and the browser back button closes the panel.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const selected = demo.find((r) => r.id === id) ?? null;

  return (
    <Page title="Transactions" subtitle="Search, filter and edit">
      <MasterDetail
        detailTitle={selected?.payee}
        onCloseDetail={() => router.setParams({ id: undefined })}
        placeholder={<Text tone="muted">Select a transaction to see its details.</Text>}
        detail={
          selected ? (
            <View className="gap-2">
              <Text tone="muted">{selected.meta}</Text>
              <Text variant="heading" tabular>
                {selected.amount}
              </Text>
            </View>
          ) : null
        }
        list={
          <Card className="overflow-hidden p-0">
            {demo.map((r, i) => (
              <ListItem
                key={r.id}
                title={r.payee}
                subtitle={r.meta}
                divider={i < demo.length - 1}
                selected={r.id === id}
                onPress={() => router.setParams({ id: r.id })}
                trailing={<Text tabular>{r.amount}</Text>}
              />
            ))}
          </Card>
        }
      />
    </Page>
  );
}
