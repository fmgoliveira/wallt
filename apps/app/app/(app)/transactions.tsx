import { Button, Card, EmptyState, Skeleton, Text, useBreakpoint, useTheme } from "@wallt/ui";
import { Plus, Receipt } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { DataGate } from "../../src/data/DataGate";
import { useTransactionPages } from "../../src/data/hooks";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";
import { BulkCategorySheet, BulkDeleteSheet } from "../../src/transactions/BulkDialogs";
import { ContextMenu, type MenuItem } from "../../src/transactions/ContextMenu";
import { useEditorStore } from "../../src/transactions/editorStore";
import { FilterBar } from "../../src/transactions/FilterBar";
import { activeFilterCount, useTxQuery } from "../../src/transactions/filters";
import { type TxRow, useTxRows } from "../../src/transactions/rows";
import { TransactionList } from "../../src/transactions/TransactionList";
import { TransactionTable } from "../../src/transactions/TransactionTable";

function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

function TransactionsContent() {
  const bp = useBreakpoint();
  const table = bp === "desktop" && Platform.OS === "web";
  const { query, filter, set, clear } = useTxQuery();
  const pages = useTransactionPages(filter);
  const txs = useMemo(() => pages.data?.pages.flat() ?? [], [pages.data]);
  const rows = useTxRows(txs);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; row: TxRow } | null>(null);
  const [dialog, setDialog] = useState<"category" | "delete" | null>(null);
  const [target, setTarget] = useState<readonly TxRow[]>([]);

  const open = useCallback((row: TxRow) => useEditorStore.getState().openEdit(row.id), []);
  const more = useCallback(() => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  }, [pages]);

  // Selection only makes sense for rows that are still listed (filters change, rows get deleted).
  useEffect(() => {
    setSelected((cur) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [rows]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const act = useCallback((kind: "category" | "delete", on: readonly TxRow[]) => {
    setTarget(on);
    setDialog(kind);
  }, []);
  const finish = () => {
    setDialog(null);
    setSelected(new Set());
  };

  // Keyboard (desktop web): / search, E edit, Del delete, Esc clear selection. N is global (shell).
  useEffect(() => {
    if (!table) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[aria-label="Search transactions"]')
          ?.focus();
      } else if ((e.key === "e" || e.key === "E") && selectedRows.length === 1 && selectedRows[0]) {
        e.preventDefault();
        open(selectedRows[0]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedRows.length > 0) {
        e.preventDefault();
        act("delete", selectedRows);
      } else if (e.key === "Escape" && selected.size > 0) {
        setSelected(new Set());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [table, selectedRows, selected.size, open, act]);

  const menuItems = (row: TxRow): MenuItem[] => {
    const on = selected.has(row.id) ? selectedRows : [row];
    const label = on.length > 1 ? ` (${on.length})` : "";
    return [
      { label: "Edit", onPress: () => open(row) },
      ...(row.transfer && on.length === 1
        ? []
        : [{ label: `Set category${label}`, onPress: () => act("category", on) }]),
      { label: `Delete${label}`, negative: true, onPress: () => act("delete", on) },
    ];
  };

  const filtered = query.q.trim() !== "" || activeFilterCount(query) > 0;

  let body: React.ReactNode;
  if (pages.isPending) {
    body = (
      <Card className="gap-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </Card>
    );
  } else if (rows.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon={placeholderIcon(Receipt)}
          title={filtered ? "No matching transactions" : "No transactions yet"}
          description={
            filtered
              ? "Try a different search or clear the filters."
              : "Add your first transaction."
          }
          actionLabel={filtered ? "Clear filters" : "Add transaction"}
          onAction={
            filtered
              ? () => {
                  clear();
                  set({ q: "" });
                }
              : () => useEditorStore.getState().openNew()
          }
        />
      </Card>
    );
  } else if (table) {
    body = (
      <TransactionTable
        rows={rows}
        sort={query.sort}
        onSort={(by) =>
          set({
            sort: {
              by,
              dir: query.sort.by === by && query.sort.dir === "desc" ? "asc" : "desc",
            },
          })
        }
        selected={selected}
        onToggle={(id) =>
          setSelected((cur) => {
            const next = new Set(cur);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
        onToggleAll={() =>
          setSelected((cur) =>
            rows.length > 0 && rows.every((r) => cur.has(r.id))
              ? new Set()
              : new Set(rows.map((r) => r.id)),
          )
        }
        onOpen={open}
        onContextMenu={(row, x, y) => setMenu({ row, x, y })}
        onEndReached={more}
      />
    );
  } else {
    body = <TransactionList rows={rows} onOpen={open} onEndReached={more} />;
  }

  return (
    <View className="flex-1 gap-3">
      <FilterBar query={query} set={set} clear={clear} />
      {table && selectedRows.length > 0 ? (
        <BulkBar
          count={selectedRows.length}
          hasTransfers={selectedRows.some((r) => r.transfer)}
          onCategory={() => act("category", selectedRows)}
          onDelete={() => act("delete", selectedRows)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}
      {body}
      {pages.isFetchingNextPage ? (
        <Text variant="small" tone="muted" className="text-center">
          Loading more…
        </Text>
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.row)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {dialog === "category" ? (
        <BulkCategorySheet rows={target} onClose={() => setDialog(null)} onDone={finish} />
      ) : null}
      {dialog === "delete" ? (
        <BulkDeleteSheet rows={target} onClose={() => setDialog(null)} onDone={finish} />
      ) : null}
    </View>
  );
}

function BulkBar({
  count,
  hasTransfers,
  onCategory,
  onDelete,
  onClear,
}: {
  count: number;
  hasTransfers: boolean;
  onCategory: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <Card className="flex-row items-center gap-2 py-2 tablet:py-2">
      <Text weight="medium" className="flex-1">
        {count} selected
      </Text>
      {hasTransfers && count === 1 ? null : (
        <Button label="Set category" variant="secondary" onPress={onCategory} />
      )}
      <Button label="Delete" variant="secondary" onPress={onDelete} />
      <Button label="Clear" variant="ghost" onPress={onClear} />
    </Card>
  );
}

export default function Transactions() {
  const { colors } = useTheme();
  const bp = useBreakpoint();
  return (
    <Page
      fill
      title="Transactions"
      subtitle="Search, filter and edit"
      actions={
        <Button
          label="Add"
          kbd={bp === "desktop" ? "N" : undefined}
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => useEditorStore.getState().openNew()}
        />
      }
    >
      <DataGate>
        <TransactionsContent />
      </DataGate>
    </Page>
  );
}
