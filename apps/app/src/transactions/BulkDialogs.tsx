import { Button, Select, Sheet, Tabs, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { categoryOptions } from "../categories/options";
import { useBulkDeleteTransactions, useBulkUpdateTransactions, useCategories } from "../data/hooks";
import { useTranslation } from "../i18n";
import type { TxRow } from "./rows";

/** Set (or clear) the category of the selected expense/income rows. Transfers have no category and are skipped. */
export function BulkCategorySheet({
  rows,
  onClose,
  onDone,
}: {
  rows: readonly TxRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const update = useBulkUpdateTransactions();
  const kinds = [
    { value: "expense", label: t("transactions.bulk.expenses") },
    { value: "income", label: t("transactions.bulk.income") },
  ] as const;
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState<string>("none");

  // A category only fits rows of its own kind, so each kind is applied separately.
  const targets = rows.filter((r) => r.tx.kind === type);
  const skipped = rows.length - targets.length;

  async function apply() {
    try {
      await update.mutateAsync({
        ids: targets.map((r) => r.id),
        patch: { categoryId: categoryId === "none" ? null : categoryId, splits: [] },
      });
      toast.success(t("transactions.bulk.updated", { count: targets.length }));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transactions.bulk.updateFailed"));
    }
  }

  return (
    <Sheet visible onClose={onClose} title={t("transactions.bulk.setCategoryTitle")}>
      <Tabs
        items={kinds}
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId("none");
        }}
      />
      <Select
        label={t("transactions.bulk.category")}
        options={[
          { value: "none", label: t("transactions.bulk.noCategory") },
          ...categoryOptions(categories, type),
        ]}
        value={categoryId}
        onChange={setCategoryId}
      />
      <Text variant="small" tone="muted">
        {targets.length === 0
          ? t(
              type === "expense" ? "transactions.bulk.noneExpense" : "transactions.bulk.noneIncome",
              {
                total: rows.length,
              },
            )
          : t(
              type === "expense"
                ? "transactions.bulk.appliesExpense"
                : "transactions.bulk.appliesIncome",
              {
                count: targets.length,
                skipped: skipped > 0 ? t("transactions.bulk.skipped", { count: skipped }) : "",
              },
            )}
      </Text>
      <Button
        label={t("transactions.bulk.apply")}
        loading={update.isPending}
        disabled={targets.length === 0}
        onPress={apply}
      />
      <Button label={t("transactions.bulk.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

export function BulkDeleteSheet({
  rows,
  onClose,
  onDone,
}: {
  rows: readonly TxRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const remove = useBulkDeleteTransactions();
  const transfers = rows.filter((r) => r.transfer).length;

  async function doDelete() {
    try {
      await remove.mutateAsync(rows.map((r) => r.id));
      toast.success(t("transactions.bulk.deleted", { count: rows.length }));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transactions.bulk.deleteFailed"));
      onClose();
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t("transactions.bulk.deleteTitle", { count: rows.length })}
    >
      <Text tone="muted">
        {t(
          transfers > 0 ? "transactions.bulk.deleteBodyTransfers" : "transactions.bulk.deleteBody",
        )}
      </Text>
      <Button
        label={t("transactions.bulk.delete")}
        variant="destructive"
        loading={remove.isPending}
        onPress={doDelete}
      />
      <Button label={t("transactions.bulk.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
