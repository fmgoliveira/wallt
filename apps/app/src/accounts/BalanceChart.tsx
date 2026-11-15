import { Card, getUiLocale, SeriesChart, Skeleton, Text, useTheme } from "@wallt/ui";
import { useMemo } from "react";
import { useDailyTotals } from "../data/reports";
import { useTranslation } from "../i18n";
import { balanceSeries, localToday } from "./balanceSeries";

export function BalanceChart({
  accountId,
  openingBalance,
}: {
  accountId: string;
  openingBalance: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const today = localToday();
  const daily = useDailyTotals(today);

  const data = useMemo(
    () =>
      balanceSeries(
        openingBalance,
        (daily.data ?? []).filter((d) => d.accountId === accountId),
        today,
        getUiLocale(),
      ),
    [daily.data, accountId, openingBalance, today],
  );

  return (
    <Card className="gap-3">
      <Text variant="title">{t("accounts.detail.chartTitle")}</Text>
      {daily.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : data.length < 2 ? (
        <Text variant="small" tone="muted">
          {t("accounts.detail.chartEmpty")}
        </Text>
      ) : (
        <SeriesChart
          area
          color={colors.accent}
          data={data}
          accessibilityLabel={t("accounts.detail.chartLabel")}
        />
      )}
    </Card>
  );
}
