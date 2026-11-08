import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { cn, Text } from "./primitives";

export interface TableColumn<Row> {
  key: string;
  header: string;
  /** Fixed width in px; columns without one share the remaining space. */
  width?: number;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  onRowPress?: (row: Row) => void;
  /** Key of the selected row: `data/10` fill and a 2 px `data` bar on the left. */
  selectedKey?: string | undefined;
  /** Minimum table width before it scrolls horizontally. */
  minWidth?: number;
  className?: string | undefined;
}

/**
 * Web/desktop table (guidelines §7): 42 px rows, mono uppercase header, no zebra, hover `text/5`,
 * last row without a border. The virtualized, sortable transactions table (P2.7) builds on it.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  onRowPress,
  selectedKey,
  minWidth = 560,
  className,
}: TableProps<Row>) {
  const cell = (c: TableColumn<Row>) =>
    cn("px-3.5", c.width ? undefined : "flex-1", c.align === "right" && "items-end");
  const cellStyle = (c: TableColumn<Row>) =>
    c.width ? { width: c.width, flexShrink: 0 } : undefined;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className}>
      <View role="table" style={{ minWidth, flexGrow: 1 }}>
        <View role="row" className="flex-row border-b border-border py-2.5">
          {columns.map((c) => (
            <View key={c.key} role="columnheader" className={cell(c)} style={cellStyle(c)}>
              <Text variant="label">{c.header}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, i) => {
          const key = rowKey(row);
          const selected = key === selectedKey;
          const last = i === rows.length - 1;
          const content = columns.map((c) => (
            <View
              key={c.key}
              role="cell"
              className={cn(cell(c), "justify-center")}
              style={cellStyle(c)}
            >
              {c.render(row)}
            </View>
          ));
          const rowClass = cn(
            "h-[42px] flex-row items-center",
            !last && "border-b border-border",
            selected && "bg-data/10",
          );
          const bar = selected ? (
            <View key="bar" className="absolute top-0 bottom-0 left-0 w-[2px] bg-data" />
          ) : null;
          return onRowPress ? (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onRowPress(row)}
              className={cn(
                rowClass,
                "web:cursor-pointer web:outline-none web:hover:bg-text/5 web:focus-visible:bg-text/5",
              )}
            >
              {bar}
              {content}
            </Pressable>
          ) : (
            <View key={key} role="row" className={rowClass}>
              {bar}
              {content}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
