import { bucketFor, reportRange } from "@wallt/core";
import { Card, EmptyState, useBreakpoint } from "@wallt/ui";
import { ChartColumn } from "lucide-react-native";
import { type ReactNode, useMemo, useState } from "react";
import { View } from "react-native";
import { DataGate } from "../../src/data/DataGate";
import { REPORT_CURRENCY, useRateTable } from "../../src/data/fx";
import {
  useAccounts,
  useBudgetStatuses,
  useCategories,
  useTransactionCount,
} from "../../src/data/hooks";
import { todayDate } from "../../src/data/recurring";
import { useDailyTotals, useReportEntries } from "../../src/data/reports";
import {
  BudgetProgressCard,
  CashflowCard,
  CategoryTrendCard,
  HeatmapCard,
  IncomeExpenseCard,
  NetWorthCard,
  type ReportData,
  SpendingCard,
  TopPayeesCard,
} from "../../src/reports/ReportCards";
import {
  defaultReportQuery,
  ReportFilters,
  type ReportQuery,
} from "../../src/reports/ReportFilters";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

/** Lays cards out in one column (phone) or two (tablet, and the desktop grid). */
function Grid({ children }: { children: ReactNode[] }) {
  const bp = useBreakpoint();
  const columns = bp === "phone" ? 1 : 2;
  const cols: ReactNode[][] = Array.from({ length: columns }, () => []);
  children.forEach((child, i) => {
    cols[i % columns]?.push(child);
  });
  return (
    <View className="flex-row items-start gap-4">
      {cols.map((col, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed number of columns
        <View key={i} className="min-w-0 flex-1 gap-4">
          {col}
        </View>
      ))}
    </View>
  );
}

function ReportsContent() {
  const today = todayDate();
  const [query, setQuery] = useState<ReportQuery>(defaultReportQuery);
  const range = useMemo(() => reportRange(query.period, today), [query.period, today]);
  const filter = useMemo(
    () => ({
      ...(query.accounts.length ? { accountIds: query.accounts } : {}),
      ...(query.categories.length ? { categoryIds: query.categories } : {}),
      ...(query.tags.length ? { tagIds: query.tags } : {}),
    }),
    [query],
  );
  const entries = useReportEntries(range, filter);
  const daily = useDailyTotals(range.to);
  const categories = useCategories({ includeArchived: true });
  const accounts = useAccounts({ includeArchived: true });
  const budgets = useBudgetStatuses(today);
  const anyTx = useTransactionCount();
  const { table } = useRateTable();

  const data: ReportData = useMemo(
    () => ({
      entries: entries.data ?? [],
      table,
      currency: REPORT_CURRENCY,
      range,
      bucket: bucketFor(range),
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      daily: daily.data ?? [],
      today,
    }),
    [entries.data, table, range, categories.data, accounts.data, daily.data, today],
  );
  const loading = entries.isPending || categories.isPending || accounts.isPending;

  return (
    <View className="gap-4">
      <ReportFilters query={query} onChange={setQuery} />
      {anyTx.data === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(ChartColumn)}
            title="Nothing to report yet"
            description="Charts appear once you have transactions."
          />
        </Card>
      ) : (
        <Grid>
          {[
            <SpendingCard key="spending" data={data} loading={loading} />,
            <IncomeExpenseCard key="flow" data={data} loading={loading} />,
            <CashflowCard key="cashflow" data={data} loading={loading} />,
            <NetWorthCard key="worth" data={data} loading={loading || daily.isPending} />,
            <BudgetProgressCard key="budgets" budgets={budgets.data} loading={budgets.isPending} />,
            <CategoryTrendCard key="trend" data={data} loading={loading} />,
            <HeatmapCard key="heat" data={data} loading={loading} />,
            <TopPayeesCard key="payees" data={data} loading={loading} />,
          ]}
        </Grid>
      )}
    </View>
  );
}

export default function Reports() {
  return (
    <Page title="Reports" subtitle={`Charts and trends in ${REPORT_CURRENCY}`}>
      <DataGate>
        <ReportsContent />
      </DataGate>
    </Page>
  );
}
