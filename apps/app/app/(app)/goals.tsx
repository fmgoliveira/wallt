import { debtProgress, formatAmount } from "@wallt/core";
import type { DebtWithProgress } from "@wallt/db";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  Progress,
  Skeleton,
  Tabs,
  Text,
  toast,
  usePrivacyStore,
  useTheme,
} from "@wallt/ui";
import { Handshake, Plus, Target } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { DataGate } from "../../src/data/DataGate";
import {
  debtWithProgress,
  useDebts,
  useGoalsWithProgress,
  useUpdateDebt,
} from "../../src/data/goals";
import { todayDate } from "../../src/data/recurring";
import { DebtForm, RepaymentForm } from "../../src/goals/DebtForm";
import { GoalForm } from "../../src/goals/GoalForm";
import { useTranslation } from "../../src/i18n";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

type Section = "goals" | "debts";

function useMoney() {
  const hidden = usePrivacyStore((s) => s.hidden);
  return (amount: number, currency: string) => (hidden ? "—" : formatAmount({ amount, currency }));
}

function GoalsList({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const { t } = useTranslation();
  const goals = useGoalsWithProgress(todayDate());
  const money = useMoney();
  if (goals.isPending) return <Skeleton className="h-32 w-full" />;
  const items = goals.data ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={placeholderIcon(Target)}
          title={t("goals.list.emptyTitle")}
          description={t("goals.list.emptyDesc")}
          actionLabel={t("goals.screen.addGoal")}
          onAction={onAdd}
        />
      </Card>
    );
  }
  return (
    <View className="gap-4">
      {items.map(({ goal, progress: p }) => (
        <Pressable
          key={goal.id}
          accessibilityRole="button"
          accessibilityLabel={t("goals.list.saved", { name: goal.name, percent: p.percent })}
          onPress={() => onEdit(goal.id)}
          className="web:cursor-pointer web:outline-none"
        >
          <Card className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text weight="medium" className="flex-1" numberOfLines={1}>
                {goal.name}
              </Text>
              {p.state === "reached" ? (
                <Chip tone="positive" label={t("goals.list.reached")} />
              ) : null}
              {p.state === "overdue" ? (
                <Chip tone="negative" label={t("goals.list.overdue")} />
              ) : null}
            </View>
            <Progress
              value={p.percent / 100}
              over={p.state === "overdue"}
              caption={t("goals.list.progress", {
                saved: money(p.saved, goal.currency),
                target: money(goal.targetAmount, goal.currency),
                percent: p.percent,
              })}
            />
            <View className="flex-row flex-wrap justify-between gap-3">
              <View>
                <Text variant="small" tone="muted">
                  {t("goals.list.left")}
                </Text>
                <Amount value={p.remaining} currency={goal.currency} tone="text" size="title" />
              </View>
              {p.state === "active" && p.neededPerMonth > 0 ? (
                <View className="items-end">
                  <Text variant="small" tone="muted">
                    {t("goals.list.neededPerMonth")}
                  </Text>
                  <Amount
                    value={p.neededPerMonth}
                    currency={goal.currency}
                    tone="text"
                    size="title"
                  />
                </View>
              ) : null}
            </View>
            {goal.deadline ? (
              <Text variant="small" tone="muted">
                {p.daysLeft !== null && p.daysLeft >= 0
                  ? t("goals.list.deadlineDays", { date: goal.deadline, n: p.daysLeft })
                  : t("goals.list.deadline", { date: goal.deadline })}
              </Text>
            ) : null}
            {goal.accountIds.length === 0 ? (
              <Text variant="small" tone="muted">
                {t("goals.list.linkAccount")}
              </Text>
            ) : null}
            {p.ignoredAccounts > 0 ? (
              <Text variant="small" tone="muted">
                {t("goals.list.ignored", { n: p.ignoredAccounts })}
              </Text>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function DebtsList({
  onAdd,
  onEdit,
  onRepay,
}: {
  onAdd: () => void;
  onEdit: (d: DebtWithProgress) => void;
  onRepay: (d: DebtWithProgress) => void;
}) {
  const { t } = useTranslation();
  const [showSettled, setShowSettled] = useState(false);
  const debts = useDebts({ includeSettled: showSettled });
  const update = useUpdateDebt();
  const money = useMoney();
  if (debts.isPending) return <Skeleton className="h-32 w-full" />;
  const items = (debts.data ?? []).map(debtWithProgress);
  if (items.length === 0 && !showSettled) {
    return (
      <Card>
        <EmptyState
          icon={placeholderIcon(Handshake)}
          title={t("goals.debts.emptyTitle")}
          description={t("goals.debts.emptyDesc")}
          actionLabel={t("goals.screen.addDebt")}
          onAction={onAdd}
        />
      </Card>
    );
  }
  const settle = async (d: DebtWithProgress) => {
    try {
      await update.mutateAsync({ id: d.id, patch: { settled: true } });
      toast.success(t("goals.debts.settledToast"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("goals.debts.updateFailed"));
    }
  };
  return (
    <View className="gap-4">
      {items.map(({ debt, progress: p }) => (
        <Card key={debt.id} className="gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => onEdit(debt)}
            className="gap-3 web:cursor-pointer web:outline-none"
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text weight="medium" numberOfLines={1}>
                  {debt.person}
                </Text>
                <Text variant="small" tone="muted">
                  {debt.direction === "lent" ? t("goals.debts.theyOwe") : t("goals.debts.youOwe")}
                </Text>
              </View>
              {p.settled ? <Chip tone="positive" label={t("goals.debts.settled")} /> : null}
            </View>
            <Progress
              value={p.percent / 100}
              caption={t("goals.debts.progress", {
                repaid: money(p.repaid, debt.currency),
                amount: money(debt.amount, debt.currency),
                percent: p.percent,
              })}
            />
            <View>
              <Text variant="small" tone="muted">
                {t("goals.debts.outstanding")}
              </Text>
              <Amount value={p.outstanding} currency={debt.currency} tone="text" size="title" />
            </View>
          </Pressable>
          {p.settled ? null : (
            <View className="flex-row justify-end gap-2">
              {p.canSettle ? (
                <Button
                  label={t("goals.debts.markSettled")}
                  variant="secondary"
                  onPress={() => settle(debt)}
                />
              ) : null}
              <Button label={t("goals.debts.recordRepayment")} onPress={() => onRepay(debt)} />
            </View>
          )}
        </Card>
      ))}
      <Button
        label={showSettled ? t("goals.debts.hideSettled") : t("goals.debts.showSettled")}
        variant="ghost"
        onPress={() => setShowSettled((s) => !s)}
      />
    </View>
  );
}

export default function Goals() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [section, setSection] = useState<Section>("goals");
  const sections = [
    { value: "goals", label: t("goals.screen.goals") },
    { value: "debts", label: t("goals.screen.debts") },
  ] as const;
  const goals = useGoalsWithProgress(todayDate());
  const debts = useDebts({ includeSettled: true });
  const [goalForm, setGoalForm] = useState<string | "new" | null>(null);
  const [debtForm, setDebtForm] = useState<DebtWithProgress | "new" | null>(null);
  const [repay, setRepay] = useState<DebtWithProgress | null>(null);

  const editingGoal =
    goalForm && goalForm !== "new"
      ? goals.data?.find((g) => g.goal.id === goalForm)?.goal
      : undefined;
  const add = () => (section === "goals" ? setGoalForm("new") : setDebtForm("new"));

  return (
    <Page
      title={t("goals.screen.title")}
      subtitle={t("goals.screen.subtitle")}
      actions={
        <Button
          label={section === "goals" ? t("goals.screen.addGoal") : t("goals.screen.addDebt")}
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={add}
          className="self-end"
        />
      }
    >
      <DataGate>
        <View className="gap-4">
          <Tabs items={sections} value={section} onChange={setSection} />
          {section === "goals" ? (
            <GoalsList onAdd={() => setGoalForm("new")} onEdit={setGoalForm} />
          ) : (
            <DebtsList onAdd={() => setDebtForm("new")} onEdit={setDebtForm} onRepay={setRepay} />
          )}
        </View>
      </DataGate>
      {goalForm && (goalForm === "new" || editingGoal) ? (
        <GoalForm goal={editingGoal} onClose={() => setGoalForm(null)} />
      ) : null}
      {debtForm ? (
        <DebtForm
          debt={
            debtForm === "new"
              ? undefined
              : (debts.data?.find((d) => d.id === debtForm.id) ?? debtForm)
          }
          onClose={() => setDebtForm(null)}
        />
      ) : null}
      {repay ? (
        <RepaymentForm
          debt={repay}
          outstanding={debtProgress(repay, repay.repaid).outstanding}
          onClose={() => setRepay(null)}
        />
      ) : null}
    </Page>
  );
}
