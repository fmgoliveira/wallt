import {
  BASE_CURRENCY,
  createRateTable,
  type Money,
  type RateTable,
  sumConverted,
} from "@wallt/core";
import { useMemo } from "react";
import { queryKeys, useRepoQuery } from "./hooks";

/** Currency reports and net worth are converted to (PLAN §1.3: base EUR). */
export const REPORT_CURRENCY = BASE_CURRENCY;

/** The device's local copy of the ECB rates as a lookup table; empty until the first download. */
export function useRateTable(): { table: RateTable; ready: boolean } {
  const rows = useRepoQuery([...queryKeys.fx, "rates"], (r) => r.fx.list());
  const table = useMemo(() => createRateTable(rows.data ?? []), [rows.data]);
  return { table, ready: rows.isSuccess };
}

/**
 * Sums per-currency balances into one figure in the report currency at today's rate. `unconverted` counts
 * currencies without any rate yet (they are left out rather than guessed).
 */
export function convertedTotal(
  table: RateTable,
  balances: readonly Money[],
  today: string,
  to: string = REPORT_CURRENCY,
): { total: number; unconverted: number } {
  return sumConverted(
    table,
    balances.map((m) => ({ amount: m.amount, currency: m.currency, date: today })),
    to,
  );
}
