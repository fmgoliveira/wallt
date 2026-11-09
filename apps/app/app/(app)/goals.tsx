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
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

type Section = "goals" | "debts";
const sections = [
  { value: "goals", label: "Goals" },
  { value: "debts", label: "Debts" },
] as const;

function useMoney() {
  const hidden = usePrivacyStore((s) => s.hidden);
  return (amount: number, currency: string) => (hidden ? "—" : formatAmount({ amount, currency }));
}

function GoalsList({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const goals = useGoalsWithProgress(todayDate());
  const money = useMoney();
  if (goals.isPending) return <Skeleton className="h-32 w-full" />;
  const items = goals.data ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={placeholderIcon(Target)}
          title="No goals yet"
          description="Set a target, link the accounts that hold the money and follow your progress."
          actionLabel="Add goal"
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
          accessibilityLabel={`${goal.name}, ${p.percent}% saved`}
          onPress={() => onEdit(goal.id)}
          className="web:cursor-pointer web:outline-none"
        >
          <Card className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text weight="medium" className="flex-1" numberOfLines={1}>
                {goal.name}
              </Text>
              {p.state === "reached" ? <Chip tone="positive" label="Reached" /> : null}
              {p.state === "overdue" ? <Chip tone="negative" label="Past deadline" /> : null}
            </View>
            <Progress
              value={p.percent / 100}
              over={p.state === "overdue"}
              caption={`${money(p.saved, goal.currency)} of ${money(goal.targetAmount, goal.currency)} · ${p.percent}%`}
            />
            <View className="flex-row flex-wrap justify-between gap-3">
              <View>
                <Text variant="small" tone="muted">
                  Left to save
                </Text>
                <Amount value={p.remaining} currency={goal.currency} tone="text" size="title" />
              </View>
              {p.state === "active" && p.neededPerMonth > 0 ? (
                <View className="items-end">
                  <Text variant="small" tone="muted">
                    Needed per month
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
                Deadline {goal.deadline}
                {p.daysLeft !== null && p.daysLeft >= 0 ? ` · ${p.daysLeft} days left` : ""}
              </Text>
            ) : null}
            {goal.accountIds.length === 0 ? (
              <Text variant="small" tone="muted">
                Link an account to track progress.
              </Text>
            ) : null}
            {p.ignoredAccounts > 0 ? (
              <Text variant="small" tone="muted">
                {p.ignoredAccounts} linked account(s) in another currency are not counted.
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
          title="No open debts"
          description="Track money you lent or borrowed and record repayments as they happen."
          actionLabel="Add debt"
          onAction={onAdd}
        />
      </Card>
    );
  }
  const settle = async (d: DebtWithProgress) => {
    try {
      await update.mutateAsync({ id: d.id, patch: { settled: true } });
      toast.success("Marked as settled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the debt");
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
                  {debt.direction === "lent" ? "They owe you" : "You owe them"}
                </Text>
              </View>
              {p.settled ? <Chip tone="positive" label="Settled" /> : null}
            </View>
            <Progress
              value={p.percent / 100}
              caption={`${money(p.repaid, debt.currency)} of ${money(debt.amount, debt.currency)} repaid · ${p.percent}%`}
            />
            <View>
              <Text variant="small" tone="muted">
                Outstanding
              </Text>
              <Amount value={p.outstanding} currency={debt.currency} tone="text" size="title" />
            </View>
          </Pressable>
          {p.settled ? null : (
            <View className="flex-row justify-end gap-2">
              {p.canSettle ? (
                <Button label="Mark settled" variant="secondary" onPress={() => settle(debt)} />
              ) : null}
              <Button label="Record repayment" onPress={() => onRepay(debt)} />
            </View>
          )}
        </Card>
      ))}
      <Button
        label={showSettled ? "Hide settled debts" : "Show settled debts"}
        variant="ghost"
        onPress={() => setShowSettled((s) => !s)}
      />
    </View>
  );
}

export default function Goals() {
  const { colors } = useTheme();
  const [section, setSection] = useState<Section>("goals");
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
      title="Goals & debts"
      subtitle="Savings targets and money lent or borrowed"
      actions={
        <Button
          label={section === "goals" ? "Add goal" : "Add debt"}
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
