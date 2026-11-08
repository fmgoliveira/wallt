import { Amount, Card, Chip, IconTile, ListItem, Text, useTheme } from "@wallt/ui";
import { ArrowLeftRight } from "lucide-react-native";
import { useMemo } from "react";
import { FlatList, View } from "react-native";
import { categoryIcon } from "../categories/icons";
import { colorForScheme } from "../components/colors";
import { dayLabel, type TxRow } from "./rows";

type Item = { kind: "day"; key: string; date: string } | { kind: "tx"; key: string; row: TxRow };

/** Phone/tablet list: transactions grouped by booking day, virtualized, loading more as it scrolls. */
export function TransactionList({
  rows,
  onOpen,
  onEndReached,
}: {
  rows: readonly TxRow[];
  onOpen: (row: TxRow) => void;
  onEndReached: () => void;
}) {
  const { scheme, colors } = useTheme();
  const items = useMemo(() => {
    const out: Item[] = [];
    let day = "";
    for (const row of rows) {
      if (row.tx.bookingDate !== day) {
        day = row.tx.bookingDate;
        out.push({ kind: "day", key: `d-${day}-${out.length}`, date: day });
      }
      out.push({ kind: "tx", key: row.id, row });
    }
    return out;
  }, [rows]);

  return (
    <Card className="flex-1 overflow-hidden p-0 tablet:p-0">
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={20}
        windowSize={9}
        renderItem={({ item, index }) => {
          if (item.kind === "day") {
            return (
              <Text variant="label" className="px-3.5 pt-3 pb-1">
                {dayLabel(item.date)}
              </Text>
            );
          }
          const { row } = item;
          const Icon = row.transfer ? ArrowLeftRight : categoryIcon(row.categoryIcon);
          const tint = colorForScheme(row.categoryColor, scheme) ?? colors.muted;
          const prev = items[index - 1];
          return (
            <ListItem
              divider={prev?.kind === "tx"}
              title={row.title}
              subtitle={`${row.transfer ? "Transfer" : (row.categoryName ?? "Uncategorised")} · ${row.accountName}`}
              leading={
                <IconTile>
                  <Icon size={18} color={tint} strokeWidth={1.6} />
                </IconTile>
              }
              trailing={
                <View className="items-end gap-1">
                  <Amount
                    value={row.tx.amount}
                    currency={row.tx.currency}
                    tone={row.transfer ? "text" : "auto"}
                  />
                  {row.tx.status === "pending" ? <Chip label="Pending" /> : null}
                </View>
              }
              onPress={() => onOpen(row)}
            />
          );
        }}
      />
    </Card>
  );
}
