import {
  addDays,
  addMonths,
  endOfMonth,
  fromLocalDate,
  isValidDate,
  startOfMonth,
} from "@wallt/core";
import type { TransactionFilter, TransactionSort } from "@wallt/db";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";

export type PeriodKey = "all" | "month" | "last-month" | "30d" | "year" | "custom";

export const periodOptions: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

/** Everything the transactions screen filters and sorts by. Lives in the URL (search params). */
export interface TxQuery {
  q: string;
  period: PeriodKey;
  from: string;
  to: string;
  accounts: string[];
  categories: string[];
  tags: string[];
  /** Signed minor units (expenses are negative). */
  min: number | null;
  max: number | null;
  sort: TransactionSort;
}

const PERIODS = new Set<string>(periodOptions.map((p) => p.value));

const list = (v: string | string[] | undefined): string[] => {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.split(",").filter(Boolean) : [];
};
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
const int = (v: string | string[] | undefined): number | null => {
  const s = one(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

export function parseQuery(params: Record<string, string | string[] | undefined>): TxQuery {
  const period = one(params.period);
  const [by, dir] = one(params.sort).split(":");
  return {
    q: one(params.q),
    period: PERIODS.has(period) ? (period as PeriodKey) : "all",
    from: one(params.from),
    to: one(params.to),
    accounts: list(params.acc),
    categories: list(params.cat),
    tags: list(params.tag),
    min: int(params.min),
    max: int(params.max),
    sort: {
      by: by === "amount" || by === "payee" ? by : "date",
      dir: dir === "asc" ? "asc" : "desc",
    },
  };
}

/** Inclusive date bounds of a period relative to `today`. */
export function periodRange(
  period: PeriodKey,
  today: string,
  custom: { from: string; to: string },
): { from?: string; to?: string } {
  switch (period) {
    case "month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const prev = addMonths(today, -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "custom":
      return {
        ...(isValidDate(custom.from) ? { from: custom.from } : {}),
        ...(isValidDate(custom.to) ? { to: custom.to } : {}),
      };
    default:
      return {};
  }
}

export function toFilter(q: TxQuery, today: string): TransactionFilter & { sort: TransactionSort } {
  const range = periodRange(q.period, today, q);
  return {
    sort: q.sort,
    ...(q.q.trim() ? { search: q.q.trim() } : {}),
    ...(q.accounts.length ? { accountIds: q.accounts } : {}),
    ...(q.categories.length ? { categoryIds: q.categories } : {}),
    ...(q.tags.length ? { tagIds: q.tags } : {}),
    ...(q.min !== null ? { minAmount: q.min } : {}),
    ...(q.max !== null ? { maxAmount: q.max } : {}),
    ...range,
  };
}

/** How many filters (besides search and sort) are active. */
export function activeFilterCount(q: TxQuery): number {
  return (
    (q.period !== "all" ? 1 : 0) +
    (q.accounts.length ? 1 : 0) +
    (q.categories.length ? 1 : 0) +
    (q.tags.length ? 1 : 0) +
    (q.min !== null || q.max !== null ? 1 : 0)
  );
}

type Patch = Partial<Omit<TxQuery, "sort">> & { sort?: TransactionSort };

/** Reads the query from the URL and writes changes back to it (browser back/forward and shareable links work). */
export function useTxQuery() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const query = useMemo(() => parseQuery(params), [params]);
  const today = fromLocalDate(new Date());
  const filter = useMemo(() => toFilter(query, today), [query, today]);

  const set = useCallback(
    (patch: Patch) => {
      const out: Record<string, string | undefined> = {};
      const join = (a: string[]) => (a.length ? a.join(",") : undefined);
      if (patch.q !== undefined) out.q = patch.q || undefined;
      if (patch.period !== undefined)
        out.period = patch.period === "all" ? undefined : patch.period;
      if (patch.from !== undefined) out.from = patch.from || undefined;
      if (patch.to !== undefined) out.to = patch.to || undefined;
      if (patch.accounts) out.acc = join(patch.accounts);
      if (patch.categories) out.cat = join(patch.categories);
      if (patch.tags) out.tag = join(patch.tags);
      if (patch.min !== undefined) out.min = patch.min === null ? undefined : String(patch.min);
      if (patch.max !== undefined) out.max = patch.max === null ? undefined : String(patch.max);
      if (patch.sort) {
        const isDefault = patch.sort.by === "date" && patch.sort.dir === "desc";
        out.sort = isDefault ? undefined : `${patch.sort.by}:${patch.sort.dir}`;
      }
      router.setParams(out);
    },
    [router],
  );

  const clear = useCallback(
    () =>
      router.setParams({
        period: undefined,
        from: undefined,
        to: undefined,
        acc: undefined,
        cat: undefined,
        tag: undefined,
        min: undefined,
        max: undefined,
      }),
    [router],
  );

  return { query, filter, set, clear };
}
