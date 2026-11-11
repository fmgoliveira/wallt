import { Amount, Card, Chip, IconTile, ListItem, Text, useBreakpoint } from "@wallt/ui";
import { ArrowLeftRight } from "lucide-react-native";
import { memo, useCallback, useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { categoryIcon } from "../categories/icons";
import { useTranslation } from "../i18n";
import { dayLabel, type TxRow } from "./rows";

type Item = { kind: "day"; key: string; date: string } | { kind: "tx"; key: string; row: TxRow };

/** One transaction row. Memoised so that appending a page or re-rendering the screen leaves rows already on screen alone. */
const TxListRow = memo(function TxListRow({
  row,
  divider,
  onOpenRef,
}: {
  row: TxRow;
  divider: boolean;
  onOpenRef: { current: (row: TxRow) => void };
}) {
  const { t } = useTranslation();
  const Icon = row.transfer ? ArrowLeftRight : categoryIcon(row.categoryIcon);
  const tint = row.categoryTint;
  return (
    <ListItem
      divider={divider}
      title={row.title}
      subtitle={`${row.accountName} · ${row.transfer ? t("transactions.row.transfer") : (row.categoryName ?? t("transactions.row.uncategorised"))}`}
      subtitleLeading={
        <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: row.accountTint }} />
      }
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
          {row.tx.status === "pending" ? <Chip label={t("transactions.row.pending")} /> : null}
        </View>
      }
      onPress={() => onOpenRef.current(row)}
    />
  );
});

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const phone = useBreakpoint() === "phone";
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

  // Stable callbacks keep FlatList from re-rendering every visible row when only the data grew.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const renderItem = useCallback(
    ({ item, index }: { item: Item; index: number }) => {
      if (item.kind === "day") {
        return (
          <Text variant="label" className="px-3.5 pt-3 pb-1">
            {dayLabel(item.date)}
          </Text>
        );
      }
      return (
        <TxListRow row={item.row} divider={items[index - 1]?.kind === "tx"} onOpenRef={onOpenRef} />
      );
    },
    [items],
  );

  return (
    // Sized to its rows (shrinks and scrolls only when the list is longer than the screen), so the card ends
    // right after the last row. On phones the margin keeps it clear of the floating tab bar.
    <Card
      className="shrink grow-0 overflow-hidden p-0 tablet:p-0"
      style={{ marginBottom: phone ? insets.bottom + 84 : 0 }}
    >
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={20}
        windowSize={9}
        renderItem={renderItem}
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={40}
      />
    </Card>
  );
}
