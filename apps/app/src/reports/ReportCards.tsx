import {
  addMonths,
  type BudgetStatus,
  type CalendarDate,
  calendarHeat,
  cashflowSeries,
  categoryTrend,
  expandCategoryIds,
  incomeVsExpense,
  netWorthSeries,
  type RateTable,
  type ReportEntry,
  spendingByCategory,
  topPayees,
} from "@wallt/core";
import {
  Amount,
  Card,
  DonutChart,
  PairedBarChart,
  Select,
  SeriesChart,
  Skeleton,
  Text,
  useTheme,
} from "@wallt/ui";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { BudgetCard, useMoneyText } from "../budgets/BudgetCard";
import { categoryTint } from "../categories/color";
import { categoryOptions } from "../categories/options";
import type { BudgetWithStatus } from "../data/hooks";
import { useTranslation } from "../i18n";

export interface ReportData {
  entries: readonly ReportEntry[];
  table: RateTable;
  currency: string;
  range: { from: CalendarDate; to: CalendarDate };
  bucket: "day" | "week" | "month";
  categories: readonly import("@wallt/core").Category[];
  accounts: readonly import("@wallt/core").Account[];
  daily: readonly import("@wallt/core").DailyTotal[];
  today: CalendarDate;
}

export function ReportCard({
  title,
  note,
  children,
  loading,
}: {
  title: string;
  note?: string | undefined;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="gap-3">
      <Text variant="title">{title}</Text>
      {loading ? <Skeleton className="h-40 w-full" /> : children}
      {note ? (
        <Text variant="small" tone="muted">
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const missing = (t: (key: "reports.missingRate", opts: { n: number }) => string, n: number) =>
  n > 0 ? t("reports.missingRate", { n }) : undefined;

const labelOf = (date: string, bucket: "day" | "week" | "month") =>
  bucket === "month" ? date.slice(5, 7) : date.slice(5).replace("-", "/");

const monthShort = (date: string) =>
  new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1).toLocaleDateString(
    undefined,
    {
      month: "short",
    },
  );
const tickLabel = (date: string, bucket: "day" | "week" | "month") =>
  bucket === "month" ? monthShort(date) : labelOf(date, bucket);

/* ------------------------------------------------------------------ spending donut */

export function SpendingCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const money = useMoneyText();
  const result = useMemo(
    () => spendingByCategory(data.entries, data.table, data.currency, data.categories, true),
    [data],
  );
  const total = result.value.reduce((s, r) => s + r.total, 0);
  const shown = result.value.slice(0, 7);
  const rest = result.value.slice(7).reduce((s, r) => s + r.total, 0);
  const rows = rest > 0 ? [...shown, { categoryId: "__other", total: rest }] : shown;
  const tint = (id: string | null) =>
    id === "__other" || id === null
      ? colors.subtle
      : categoryTint(
          data.categories.find((c) => c.id === id),
          data.categories,
          scheme,
        );
  const name = (id: string | null) =>
    id === "__other"
      ? t("reports.other")
      : id === null
        ? t("reports.uncategorised")
        : (data.categories.find((c) => c.id === id)?.name ?? t("reports.unknown"));

  return (
    <ReportCard
      title={t("reports.spendingTitle")}
      loading={loading}
      note={missing(t, result.unconverted)}
    >
      {rows.length === 0 ? (
        <Text tone="muted">{t("reports.noSpending")}</Text>
      ) : (
        <View className="items-center gap-4">
          <DonutChart
            data={rows.map((r) => ({ value: r.total, color: tint(r.categoryId) }))}
            centerLabel={money(total, data.currency)}
            centerCaption={t("reports.spent")}
            accessibilityLabel={t("reports.spendingLabel", { total: money(total, data.currency) })}
          />
          <View className="w-full gap-2">
            {rows.map((r) => (
              <View key={String(r.categoryId)} className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 3,
                    backgroundColor: tint(r.categoryId),
                  }}
                />
                <Text className="flex-1" numberOfLines={1}>
                  {name(r.categoryId)}
                </Text>
                <Text variant="small" tone="muted" tabular>
                  {total > 0 ? Math.round((r.total * 100) / total) : 0}%
                </Text>
                <Amount value={-r.total} currency={data.currency} tone="text" />
              </View>
            ))}
          </View>
        </View>
      )}
    </ReportCard>
  );
}

/* --------------------------------------------------------------- income vs expense */

export function IncomeExpenseCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const result = useMemo(
    () => incomeVsExpense(data.entries, data.table, data.currency, data.range, data.bucket),
    [data],
  );
  const income = result.value.reduce((s, p) => s + p.income, 0);
  const expense = result.value.reduce((s, p) => s + p.expense, 0);
  return (
    <ReportCard
      title={t("reports.incomeVsExpenses")}
      loading={loading}
      note={missing(t, result.unconverted)}
    >
      <View className="flex-row justify-between">
        <View>
          <Text variant="small" tone="muted">
            {t("reports.income")}
          </Text>
          <Amount value={income} currency={data.currency} size="heading" />
        </View>
        <View className="items-end">
          <Text variant="small" tone="muted">
            {t("reports.expenses")}
          </Text>
          <Amount value={-expense} currency={data.currency} size="heading" tone="text" />
        </View>
      </View>
      <PairedBarChart
        data={result.value.map((p) => ({
          label: tickLabel(p.date, data.bucket),
          a: p.income,
          b: p.expense,
        }))}
        accessibilityLabel={t("reports.incomeExpensesLabel")}
      />
      <View className="flex-row gap-4">
        <Legend color={colors.positive} label={t("reports.income")} />
        <Legend color={colors.text} label={t("reports.expenses")} />
      </View>
    </ReportCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------------ cashflow */

export function CashflowCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const result = useMemo(
    () => incomeVsExpense(data.entries, data.table, data.currency, data.range, data.bucket),
    [data],
  );
  const series = cashflowSeries(result.value);
  const net = series.at(-1)?.cumulative ?? 0;
  return (
    <ReportCard
      title={t("reports.cashflow")}
      loading={loading}
      note={missing(t, result.unconverted)}
    >
      <View>
        <Text variant="small" tone="muted">
          {t("reports.netOverPeriod")}
        </Text>
        <Amount value={net} currency={data.currency} size="heading" />
      </View>
      <SeriesChart
        data={series.map((p) => ({ label: tickLabel(p.date, data.bucket), value: p.cumulative }))}
        accessibilityLabel={t("reports.cashflowLabel")}
      />
    </ReportCard>
  );
}

/* ----------------------------------------------------------------------- net worth */

export function NetWorthCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const result = useMemo(() => {
    const dates: CalendarDate[] = [];
    const end = [data.range.to, data.today].sort()[0] as string;
    const steps = 12;
    const span = Math.max(
      1,
      Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${data.range.from}T00:00:00Z`)) / 86_400_000,
      ),
    );
    for (let i = 0; i <= steps; i++) {
      const d = new Date(
        Date.parse(`${data.range.from}T00:00:00Z`) + Math.round((span * i) / steps) * 86_400_000,
      );
      dates.push(d.toISOString().slice(0, 10));
    }
    return netWorthSeries(
      data.accounts.map((a) => ({
        id: a.id,
        currency: a.currency,
        openingBalance: a.openingBalance,
        includeInNetWorth: a.includeInNetWorth,
      })),
      data.daily,
      data.table,
      data.currency,
      [...new Set(dates)].sort(),
    );
  }, [data]);
  const last = result.value.at(-1)?.value ?? 0;
  return (
    <ReportCard
      title={t("reports.netWorth")}
      loading={loading}
      note={result.unconverted > 0 ? t("reports.accountsMissingRate") : undefined}
    >
      <View>
        <Text variant="small" tone="muted">
          {t("reports.now")}
        </Text>
        <Amount value={last} currency={data.currency} size="heading" />
      </View>
      <SeriesChart
        area
        color={colors.accent}
        data={result.value.map((p) => ({ label: tickLabel(p.date, "week"), value: p.value }))}
        accessibilityLabel={t("reports.netWorthLabel")}
      />
    </ReportCard>
  );
}

/* ---------------------------------------------------------------------- budgets */

export function BudgetProgressCard({
  budgets,
  loading,
}: {
  budgets: BudgetWithStatus[] | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const active = (budgets ?? []).filter(
    (b): b is BudgetWithStatus & { status: BudgetStatus } => b.status?.state === "active",
  );
  return (
    <ReportCard title={t("reports.budgetProgress")} loading={loading}>
      {active.length === 0 ? (
        <Text tone="muted">{t("reports.noActiveBudgets")}</Text>
      ) : (
        <View className="gap-5">
          {active.slice(0, 6).map((b) => (
            <BudgetCard key={b.budget.id} item={b} compact />
          ))}
        </View>
      )}
    </ReportCard>
  );
}

/* ------------------------------------------------------------------ category trend */

export function CategoryTrendCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const options = categoryOptions(data.categories as never, "expense").filter((o) =>
    data.categories.some((c) => c.id === o.value && c.parentId === null),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const categoryId = picked ?? options[0]?.value ?? null;
  const trend = useMemo(() => {
    if (!categoryId) return null;
    return categoryTrend(
      data.entries,
      data.table,
      data.currency,
      expandCategoryIds([categoryId], data.categories),
      data.range,
      data.bucket === "day" ? "week" : data.bucket,
    );
  }, [data, categoryId]);
  const category = data.categories.find((c) => c.id === categoryId);
  return (
    <ReportCard
      title={t("reports.categoryTrend")}
      loading={loading}
      note={trend ? missing(t, trend.unconverted) : undefined}
    >
      {options.length === 0 ? (
        <Text tone="muted">{t("reports.noExpenseCategories")}</Text>
      ) : (
        <>
          <Select
            label={t("reports.category")}
            options={options}
            value={categoryId}
            onChange={setPicked}
          />
          <SeriesChart
            area
            color={category ? categoryTint(category, data.categories as never, scheme) : undefined}
            data={(trend?.value ?? []).map((p) => ({
              label: tickLabel(p.date, data.bucket === "day" ? "week" : data.bucket),
              value: p.total,
            }))}
            accessibilityLabel={t("reports.trendLabel", {
              category: category?.name ?? t("reports.categoryFallback"),
            })}
          />
        </>
      )}
    </ReportCard>
  );
}

/* --------------------------------------------------------------------- heatmap */

export function HeatmapCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const result = useMemo(() => {
    // The heatmap shows at most the last 6 months of the period.
    const from = [data.range.from, addMonths(data.range.to, -5)].sort().at(-1) as string;
    return calendarHeat(data.entries, data.table, data.currency, { from, to: data.range.to });
  }, [data]);
  const days = result.value;
  // Columns are weeks (Monday first); pad the first week so rows line up with weekdays.
  const first = days[0] ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const cells: ((typeof days)[number] | null)[] = [...Array(first).fill(null), ...days];
  const weeks: ((typeof days)[number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const shade = (level: number) =>
    level === 0 ? colors.border : `${colors.text}${["", "33", "59", "8c", "d9"][level]}`;
  return (
    <ReportCard
      title={t("reports.calendarTitle")}
      loading={loading}
      note={missing(t, result.unconverted)}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("reports.calendarLabel")}
        className="flex-row gap-[3px]"
      >
        {weeks.map((week) => (
          <View key={week.find(Boolean)?.date ?? "pad"} className="flex-1 gap-[3px]">
            {Array.from({ length: 7 }, (_, i) => week[i] ?? null).map((d, i) => (
              <View
                key={d?.date ?? `p${i}`}
                style={{
                  width: "100%",
                  aspectRatio: 1,
                  borderRadius: 3,
                  backgroundColor: d ? shade(d.level) : "transparent",
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View className="flex-row items-center gap-1.5">
        <Text variant="small" tone="muted">
          {t("reports.less")}
        </Text>
        {[0, 1, 2, 3, 4].map((l) => (
          <View
            key={l}
            style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: shade(l) }}
          />
        ))}
        <Text variant="small" tone="muted">
          {t("reports.more")}
        </Text>
      </View>
    </ReportCard>
  );
}

/* ------------------------------------------------------------------- top payees */

export function TopPayeesCard({ data, loading }: { data: ReportData; loading: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const result = useMemo(() => topPayees(data.entries, data.table, data.currency, 8), [data]);
  const biggest = Math.max(1, ...result.value.map((p) => p.total));
  return (
    <ReportCard
      title={t("reports.topPayees")}
      loading={loading}
      note={missing(t, result.unconverted)}
    >
      {result.value.length === 0 ? (
        <Text tone="muted">{t("reports.noSpending")}</Text>
      ) : (
        <View className="gap-3">
          {result.value.map((p) => (
            <View key={p.payee} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1" numberOfLines={1}>
                  {p.payee}
                </Text>
                <Text variant="small" tone="muted">
                  {p.count}×
                </Text>
                <Amount value={-p.total} currency={data.currency} tone="text" />
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
                <View
                  style={{
                    width: `${Math.max((p.total / biggest) * 100, 3)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.text,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ReportCard>
  );
}
