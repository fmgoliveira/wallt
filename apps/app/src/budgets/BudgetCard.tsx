import { type BudgetLevel, formatAmount } from "@wallt/core";
import { Amount, Card, Chip, Progress, Text, usePrivacyStore } from "@wallt/ui";
import { Pressable, View } from "react-native";
import type { BudgetWithStatus } from "../data/hooks";
import { useTranslation } from "../i18n";

const levelChip = {
  ok: { tone: "neutral", label: "budgets.levelOk" },
  warning: { tone: "warning", label: "budgets.levelWarning" },
  over: { tone: "negative", label: "budgets.levelOver" },
} as const satisfies Record<
  BudgetLevel,
  { tone: "neutral" | "warning" | "negative"; label: string }
>;

const periodLabel = {
  month: "budgets.periodMonth",
  week: "budgets.periodWeek",
  custom: "budgets.periodCustom",
} as const;

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
  const { t } = useTranslation();
  const money = useMoneyText();
  if (!status) return null;
  const caption = t("budgets.caption", {
    spent: money(status.spent, budget.currency),
    allowance: money(status.allowance, budget.currency),
    percent: status.percent,
  });
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
              {t(periodLabel[budget.period])}
              {status.state === "upcoming" ? ` · ${t("budgets.startsSoon")}` : ""}
              {status.state === "ended" ? ` · ${t("budgets.ended")}` : ""}
            </Text>
          )}
        </View>
        {status.level === "ok" ? null : <Chip tone={chip.tone} label={t(chip.label)} />}
      </View>
      <Progress
        value={status.allowance > 0 ? status.spent / status.allowance : status.spent > 0 ? 2 : 0}
        caption={caption}
        over={status.level === "over"}
      />
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text variant="small" tone="muted">
            {status.remaining >= 0 ? t("budgets.left") : t("budgets.overBy")}
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
              {status.remaining > 0 ? t("budgets.safeToSpend") : t("budgets.noRoomLeft")}
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
          {t("budgets.carriedOver", { amount: money(status.carry, budget.currency) })}
        </Text>
      )}
    </View>
  );
  if (compact) return body; // sits inside another card
  if (!onPress) return <Card>{body}</Card>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("budgets.cardLabel", { name: budget.name, percent: status.percent })}
      onPress={onPress}
      className="web:cursor-pointer web:outline-none"
    >
      <Card>{body}</Card>
    </Pressable>
  );
}
