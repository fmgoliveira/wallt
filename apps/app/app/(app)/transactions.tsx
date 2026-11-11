import { Button, Card, EmptyState, Skeleton, Text, useBreakpoint, useTheme } from "@wallt/ui";
import { Plus, Receipt } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { DataGate } from "../../src/data/DataGate";
import { useTransactionPages } from "../../src/data/hooks";
import { useTranslation } from "../../src/i18n";
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
  const { t } = useTranslation();
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
          .querySelector<HTMLInputElement>(
            `input[aria-label="${t("transactions.filters.searchLabel")}"]`,
          )
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
  }, [table, selectedRows, selected.size, open, act, t]);

  const menuItems = (row: TxRow): MenuItem[] => {
    const on = selected.has(row.id) ? selectedRows : [row];
    const many = on.length > 1;
    return [
      { label: t("transactions.menu.edit"), onPress: () => open(row) },
      ...(row.transfer && on.length === 1
        ? []
        : [
            {
              label: many
                ? t("transactions.menu.setCategoryN", { n: on.length })
                : t("transactions.menu.setCategory"),
              onPress: () => act("category", on),
            },
          ]),
      {
        label: many
          ? t("transactions.menu.deleteN", { n: on.length })
          : t("transactions.menu.delete"),
        negative: true,
        onPress: () => act("delete", on),
      },
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
          title={
            filtered ? t("transactions.page.emptyFilteredTitle") : t("transactions.page.emptyTitle")
          }
          description={
            filtered
              ? t("transactions.page.emptyFilteredDescription")
              : t("transactions.page.emptyDescription")
          }
          actionLabel={
            filtered ? t("transactions.page.clearFilters") : t("transactions.page.addTransaction")
          }
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
          {t("transactions.page.loadingMore")}
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
  const { t } = useTranslation();
  return (
    <Card className="flex-row items-center gap-2 py-2 tablet:py-2">
      <Text weight="medium" className="flex-1">
        {t("transactions.bulkBar.selected", { n: count })}
      </Text>
      {hasTransfers && count === 1 ? null : (
        <Button
          label={t("transactions.bulkBar.setCategory")}
          variant="secondary"
          onPress={onCategory}
        />
      )}
      <Button label={t("transactions.bulkBar.delete")} variant="secondary" onPress={onDelete} />
      <Button label={t("transactions.bulkBar.clear")} variant="ghost" onPress={onClear} />
    </Card>
  );
}

export default function Transactions() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bp = useBreakpoint();
  return (
    <Page
      fill
      title={t("transactions.page.title")}
      subtitle={t("transactions.page.subtitle")}
      actions={
        <Button
          label={t("transactions.page.add")}
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
