import type { DateRange, ReportFilter } from "@wallt/db";
import { queryKeys, useRepoQuery } from "./hooks";

/** Income and expense entries for a period, narrowed by the report filters. */
export const useReportEntries = (range: DateRange, filter: ReportFilter) =>
  useRepoQuery([...queryKeys.transactions, "report-entries", range, filter], (r) =>
    r.transactions.reportEntries(range, filter),
  );

/** Per account and day activity up to `to`, the base for net worth over time. */
export const useDailyTotals = (to: string) =>
  useRepoQuery([...queryKeys.transactions, "daily-totals", to], (r) =>
    r.transactions.dailyTotals(to),
  );
