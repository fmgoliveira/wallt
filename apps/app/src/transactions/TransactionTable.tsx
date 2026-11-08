import { Amount, Card, Text, useTheme } from "@wallt/ui";
import { ArrowDown, ArrowUp, Check } from "lucide-react-native";
import { FlatList, Pressable, View, type ViewStyle } from "react-native";
import { colorForScheme } from "../components/colors";
import type { TxQuery } from "./filters";
import type { TxRow } from "./rows";

export const ROW_HEIGHT = 44;

const COL = {
  check: 44,
  date: 112,
  category: 220,
  account: 168,
  amount: 140,
} as const;

type SortBy = TxQuery["sort"]["by"];

function Box({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      hitSlop={6}
      className="items-center justify-center web:cursor-pointer web:outline-none"
      style={{ width: COL.check, height: ROW_HEIGHT }}
    >
      <View
        className="h-[18px] w-[18px] items-center justify-center rounded-sm"
        style={{
          backgroundColor: checked ? colors.text : undefined,
          boxShadow: checked ? undefined : `0 0 0 1.5px ${colors.borderStrong}`,
        }}
      >
        {checked ? <Check size={12} color={colors.bg} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function HeaderCell({
  label,
  by,
  sort,
  onSort,
  style,
  right,
}: {
  label: string;
  by?: SortBy;
  sort: TxQuery["sort"];
  onSort: (by: SortBy) => void;
  style?: ViewStyle;
  right?: boolean;
}) {
  const { colors } = useTheme();
  const active = by !== undefined && sort.by === by;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  const content = (
    <View
      className="flex-row items-center gap-1"
      style={right ? { justifyContent: "flex-end" } : undefined}
    >
      <Text variant="label" tone={active ? "default" : "muted"}>
        {label}
      </Text>
      {active ? <Arrow size={12} color={colors.text} strokeWidth={2} /> : null}
    </View>
  );
  if (!by) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      onPress={() => onSort(by)}
      className="web:cursor-pointer web:outline-none web:hover:opacity-70"
      style={style}
    >
      {content}
    </Pressable>
  );
}

/**
 * Desktop web table: sortable headers, checkbox selection, fixed 44 px rows so the virtualized list can skip
 * measuring, right-click menu. Rows are pages of 100 loaded on demand.
 */
export function TransactionTable({
  rows,
  sort,
  onSort,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onContextMenu,
  onEndReached,
}: {
  rows: readonly TxRow[];
  sort: TxQuery["sort"];
  onSort: (by: SortBy) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (row: TxRow) => void;
  onContextMenu: (row: TxRow, x: number, y: number) => void;
  onEndReached: () => void;
}) {
  const { scheme, colors } = useTheme();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const fixed = (width: number): ViewStyle => ({ width, flexShrink: 0 });

  return (
    <Card className="flex-1 overflow-hidden p-0 tablet:p-0">
      <View
        role="row"
        className="flex-row items-center border-b border-border"
        style={{ height: ROW_HEIGHT }}
      >
        <Box checked={allSelected} onPress={onToggleAll} label="Select all loaded transactions" />
        <HeaderCell label="Date" by="date" sort={sort} onSort={onSort} style={fixed(COL.date)} />
        <HeaderCell label="Payee" by="payee" sort={sort} onSort={onSort} style={{ flex: 1 }} />
        <HeaderCell label="Category" sort={sort} onSort={onSort} style={fixed(COL.category)} />
        <HeaderCell label="Account" sort={sort} onSort={onSort} style={fixed(COL.account)} />
        <HeaderCell
          label="Amount"
          by="amount"
          sort={sort}
          onSort={onSort}
          style={{ ...fixed(COL.amount), paddingRight: 16 }}
          right
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={30}
        windowSize={11}
        maxToRenderPerBatch={40}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        renderItem={({ item: row }) => {
          const isSelected = selected.has(row.id);
          const tint = colorForScheme(row.categoryColor, scheme);
          return (
            <Pressable
              role="row"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onOpen(row)}
              // react-native-web forwards the DOM context-menu event
              {...({
                onContextMenu: (e: {
                  preventDefault: () => void;
                  clientX: number;
                  clientY: number;
                }) => {
                  e.preventDefault();
                  onContextMenu(row, e.clientX, e.clientY);
                },
              } as object)}
              className="flex-row items-center web:cursor-pointer web:outline-none web:transition-colors web:duration-100 web:hover:bg-text/5 web:focus-visible:bg-text/5"
              style={{
                height: ROW_HEIGHT,
                backgroundColor: isSelected ? `${colors.text}0f` : undefined,
              }}
            >
              <Box
                checked={isSelected}
                onPress={() => onToggle(row.id)}
                label={`Select ${row.title}`}
              />
              <Text tone="muted" style={fixed(COL.date)} numberOfLines={1}>
                {row.tx.bookingDate}
              </Text>
              <View className="flex-1 flex-row items-center gap-2 pr-3">
                <Text weight="medium" numberOfLines={1} className="shrink">
                  {row.title}
                </Text>
                {row.tx.status === "pending" ? (
                  <Text variant="small" tone="muted">
                    Pending
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-2 pr-3" style={fixed(COL.category)}>
                {row.categoryName && !row.transfer ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      backgroundColor: tint ?? colors.subtle,
                    }}
                  />
                ) : null}
                <Text tone="muted" numberOfLines={1} className="shrink">
                  {row.transfer ? "Transfer" : (row.categoryName ?? "Uncategorised")}
                </Text>
              </View>
              <Text tone="muted" numberOfLines={1} style={fixed(COL.account)}>
                {row.accountName}
              </Text>
              <View className="items-end pr-4" style={fixed(COL.amount)}>
                <Amount
                  value={row.tx.amount}
                  currency={row.tx.currency}
                  tone={row.transfer ? "text" : "auto"}
                />
              </View>
            </Pressable>
          );
        }}
      />
    </Card>
  );
}
