import { type BudgetLevel, formatAmount } from "@wallt/core";
import { Amount, Card, Chip, Progress, Text, usePrivacyStore } from "@wallt/ui";
import { Pressable, View } from "react-native";
import type { BudgetWithStatus } from "../data/hooks";

const levelChip: Record<BudgetLevel, { tone: "neutral" | "warning" | "negative"; label: string }> =
  {
    ok: { tone: "neutral", label: "On track" },
    warning: { tone: "warning", label: "Close to limit" },
    over: { tone: "negative", label: "Over budget" },
  };

const periodLabel = { month: "Monthly", week: "Weekly", custom: "Custom" } as const;

/** Money for a caption string, honouring privacy mode. */
export function useMoneyText() {
  const hidden = usePrivacyStore((s) => s.hidden);
  return (amount: number, currency: string) => (hidden ? "—" : formatAmount({ amount, currency }));
}

/** One budget: name, progress bar, what is left and the daily safe-to-spend figure. */
export function BudgetCard({
  item,
  onPress,
  compact,
}: {
  item: BudgetWithStatus;
  onPress?: () => void;
  /** Dashboard snapshot: name, bar and remaining only. */
  compact?: boolean;
}) {
  const { budget, status } = item;
  const money = useMoneyText();
  if (!status) return null;
  const caption = `${money(status.spent, budget.currency)} of ${money(status.allowance, budget.currency)} · ${status.percent}%`;
  const chip = levelChip[status.level];
  const body = (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text weight="medium" numberOfLines={1}>
            {budget.name}
          </Text>
          {compact ? null : (
            <Text variant="small" tone="muted">
              {periodLabel[budget.period]}
              {status.state === "upcoming" ? " · starts soon" : ""}
              {status.state === "ended" ? " · ended" : ""}
            </Text>
          )}
        </View>
        {status.level === "ok" ? null : <Chip tone={chip.tone} label={chip.label} />}
      </View>
      <Progress
        value={status.allowance > 0 ? status.spent / status.allowance : status.spent > 0 ? 2 : 0}
        caption={caption}
        over={status.level === "over"}
      />
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text variant="small" tone="muted">
            {status.remaining >= 0 ? "Left" : "Over by"}
          </Text>
          <Amount
            value={Math.abs(status.remaining)}
            currency={budget.currency}
            tone="text"
            size="title"
          />
        </View>
        {compact || status.state !== "active" ? null : (
          <View className="items-end">
            <Text variant="small" tone="muted">
              {status.remaining > 0 ? "Safe to spend / day" : "No spending room left"}
            </Text>
            {status.remaining > 0 ? (
              <Amount
                value={status.safeToSpendPerDay}
                currency={budget.currency}
                tone="text"
                size="title"
              />
            ) : null}
          </View>
        )}
      </View>
      {compact || status.carry === 0 ? null : (
        <Text variant="small" tone="muted">
          Includes {money(status.carry, budget.currency)} carried over
        </Text>
      )}
    </View>
  );
  if (compact) return body; // sits inside another card
  if (!onPress) return <Card>{body}</Card>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${budget.name}, ${status.percent}% spent`}
      onPress={onPress}
      className="web:cursor-pointer web:outline-none"
    >
      <Card>{body}</Card>
    </Pressable>
  );
}
