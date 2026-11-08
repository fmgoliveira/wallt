import {
  Amount,
  Card,
  type CategoryColorName,
  CategoryDot,
  IconTile,
  ListItem,
  MasterDetail,
  Text,
  useTheme,
} from "@wallt/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Banknote, Bus, ShoppingBasket } from "lucide-react-native";
import { View } from "react-native";
import { Page } from "../../src/shell/Page";

// Demo rows only; real data arrives with the repository layer and P2.6/P2.7. Amounts are minor units.
const demo: {
  id: string;
  payee: string;
  category: string;
  color: CategoryColorName;
  date: string;
  amount: number;
  icon: typeof ShoppingBasket;
}[] = [
  {
    id: "1",
    payee: "Corner Market",
    category: "Groceries",
    color: "green",
    date: "2026-11-04",
    amount: -4230,
    icon: ShoppingBasket,
  },
  {
    id: "2",
    payee: "Acme Payroll",
    category: "Salary",
    color: "sky",
    date: "2026-11-03",
    amount: 245000,
    icon: Banknote,
  },
  {
    id: "3",
    payee: "City Transit",
    category: "Transport",
    color: "amber",
    date: "2026-11-01",
    amount: -3000,
    icon: Bus,
  },
];

export default function Transactions() {
  const router = useRouter();
  const { colors } = useTheme();
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
              <View className="flex-row items-center gap-1.5">
                <CategoryDot color={selected.color} />
                <Text tone="muted">
                  {selected.category} · {selected.date}
                </Text>
              </View>
              <Amount value={selected.amount} size="heading" />
            </View>
          ) : null
        }
        list={
          <Card className="overflow-hidden p-0 tablet:p-0">
            <Text variant="label" className="px-3.5 pt-3 pb-1">
              November
            </Text>
            {demo.map((r, i) => (
              <ListItem
                key={r.id}
                title={r.payee}
                subtitle={`${r.category} · ${r.date}`}
                subtitleLeading={<CategoryDot color={r.color} />}
                divider={i > 0}
                selected={r.id === id}
                onPress={() => router.setParams({ id: r.id })}
                leading={
                  <IconTile>
                    <r.icon size={18} color={colors.muted} strokeWidth={1.6} />
                  </IconTile>
                }
                trailing={<Amount value={r.amount} />}
              />
            ))}
          </Card>
        }
      />
    </Page>
  );
}
