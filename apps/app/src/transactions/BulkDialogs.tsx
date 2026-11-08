import { Button, Select, Sheet, Tabs, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { categoryOptions } from "../categories/options";
import { useBulkDeleteTransactions, useBulkUpdateTransactions, useCategories } from "../data/hooks";
import type { TxRow } from "./rows";

const kinds = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
] as const;

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
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const update = useBulkUpdateTransactions();
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
      toast.success(`Updated ${targets.length} transaction${targets.length === 1 ? "" : "s"}`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the transactions");
    }
  }

  return (
    <Sheet visible onClose={onClose} title="Set category">
      <Tabs
        items={kinds}
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId("none");
        }}
      />
      <Select
        label="Category"
        options={[{ value: "none", label: "No category" }, ...categoryOptions(categories, type)]}
        value={categoryId}
        onChange={setCategoryId}
      />
      <Text variant="small" tone="muted">
        {targets.length === 0
          ? `None of the ${rows.length} selected are ${type === "expense" ? "expenses" : "income"}.`
          : `Applies to ${targets.length} ${type === "expense" ? "expense" : "income"} transaction${targets.length === 1 ? "" : "s"}${skipped > 0 ? `; ${skipped} other${skipped === 1 ? "" : "s"} unchanged` : ""}. Splits on them are replaced.`}
      </Text>
      <Button
        label="Apply"
        loading={update.isPending}
        disabled={targets.length === 0}
        onPress={apply}
      />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
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
  const remove = useBulkDeleteTransactions();
  const transfers = rows.filter((r) => r.transfer).length;

  async function doDelete() {
    try {
      await remove.mutateAsync(rows.map((r) => r.id));
      toast.success(`Deleted ${rows.length} transaction${rows.length === 1 ? "" : "s"}`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the transactions");
      onClose();
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Delete ${rows.length} transaction${rows.length === 1 ? "" : "s"}?`}
    >
      <Text tone="muted">
        Balances update. {transfers > 0 ? "Both sides of each transfer are removed. " : ""}This
        cannot be undone here.
      </Text>
      <Button label="Delete" variant="destructive" loading={remove.isPending} onPress={doDelete} />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
