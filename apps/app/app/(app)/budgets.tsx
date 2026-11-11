import { fromLocalDate } from "@wallt/core";
import { Button, Card, EmptyState, Skeleton, useBreakpoint, useTheme } from "@wallt/ui";
import { PiggyBank, Plus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { BudgetCard } from "../../src/budgets/BudgetCard";
import { BudgetForm } from "../../src/budgets/BudgetForm";
import { DataGate } from "../../src/data/DataGate";
import { type BudgetWithStatus, useBudgetStatuses } from "../../src/data/hooks";
import { useTranslation } from "../../src/i18n";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

function BudgetsContent({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (item: BudgetWithStatus) => void;
}) {
  const { t } = useTranslation();
  const bp = useBreakpoint();
  const today = fromLocalDate(new Date());
  const statuses = useBudgetStatuses(today);
  const items = statuses.data ?? [];

  if (statuses.isPending) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={placeholderIcon(PiggyBank)}
          title={t("budgets.emptyTitle")}
          description={t("budgets.emptyDescription")}
          actionLabel={t("budgets.addBudget")}
          onAction={onAdd}
        />
      </Card>
    );
  }
  const columns = bp === "phone" ? 1 : 2;
  const rows: BudgetWithStatus[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View className="gap-4">
      {rows.map((row) => (
        <View key={row[0]?.budget.id} className="flex-row gap-4">
          {row.map((item) => (
            <View key={item.budget.id} className="flex-1">
              <BudgetCard item={item} onPress={() => onEdit(item)} />
            </View>
          ))}
          {row.length < columns ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

export default function Budgets() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [editing, setEditing] = useState<BudgetWithStatus | "new" | null>(null);
  return (
    <Page
      title={t("budgets.title")}
      subtitle={t("budgets.subtitle")}
      actions={
        <Button
          label={t("budgets.addBudget")}
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setEditing("new")}
          className="self-end"
        />
      }
    >
      <DataGate>
        <BudgetsContent onAdd={() => setEditing("new")} onEdit={setEditing} />
      </DataGate>
      {editing ? (
        <BudgetForm
          budget={editing === "new" ? undefined : editing.budget}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Page>
  );
}
