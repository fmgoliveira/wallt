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
  /** Minimum table width before it scrolls horizontally. */
  minWidth?: number;
  className?: string | undefined;
}

/**
 * Simple presentational table for the desktop layout (plan §9.2). The virtualized, sortable
 * transactions table in P2.7 builds on the same header/row styling.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  onRowPress,
  minWidth = 560,
  className,
}: TableProps<Row>) {
  const cell = (c: TableColumn<Row>) =>
    cn("px-3", c.width ? undefined : "flex-1", c.align === "right" && "items-end");

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className}>
      <View role="table" style={{ minWidth, flexGrow: 1 }}>
        <View role="row" className="flex-row border-b border-border bg-bg py-2">
          {columns.map((c) => (
            <View
              key={c.key}
              role="columnheader"
              className={cell(c)}
              style={c.width ? { width: c.width, flexShrink: 0 } : undefined}
            >
              <Text variant="caption" tone="muted">
                {c.header}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row) => {
          const content = columns.map((c) => (
            <View
              key={c.key}
              role="cell"
              className={cn(cell(c), "justify-center")}
              style={c.width ? { width: c.width, flexShrink: 0 } : undefined}
            >
              {c.render(row)}
            </View>
          ));
          const rowClass = "min-h-[48px] flex-row items-center border-b border-border py-2";
          return onRowPress ? (
            <Pressable
              key={rowKey(row)}
              accessibilityRole="button"
              onPress={() => onRowPress(row)}
              className={cn(rowClass, "web:cursor-pointer web:hover:bg-border/40")}
            >
              {content}
            </Pressable>
          ) : (
            <View key={rowKey(row)} role="row" className={rowClass}>
              {content}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
