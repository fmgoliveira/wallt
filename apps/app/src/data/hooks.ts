import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type Budget,
  type BudgetStatus,
  budgetStatus,
  entriesNeededFrom,
  expandCategoryIds,
} from "@wallt/core";
import type {
  AccountPatch,
  BudgetPatch,
  CategoryPatch,
  DateRange,
  NewAccount,
  NewBudget,
  NewCategory,
  NewTag,
  NewTransaction,
  NewTransfer,
  Repository,
  TagPatch,
  TransactionFilter,
  TransactionPatch,
  TransactionSort,
  TransferPatch,
} from "@wallt/db";
import { useDataState } from "./RepositoryProvider";

/** Query-key roots. Mutations invalidate by root, so every list/detail under it refetches. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  tags: ["tags"] as const,
  transactions: ["transactions"] as const,
  budgets: ["budgets"] as const,
  recurring: ["recurring"] as const,
  goals: ["goals"] as const,
  debts: ["debts"] as const,
};

type Root = keyof typeof queryKeys;

/**
 * What a write invalidates. Transactions change derived account balances, so they also invalidate accounts;
 * deleting an account/category/tag changes how transactions are shown.
 */
const invalidates: Record<Root, Root[]> = {
  accounts: ["accounts", "transactions", "budgets", "goals", "debts"],
  categories: ["categories", "transactions", "budgets"],
  tags: ["tags", "transactions", "budgets"],
  transactions: ["transactions", "accounts", "categories", "budgets", "goals", "debts"],
  budgets: ["budgets"],
  recurring: ["recurring", "transactions", "accounts", "categories", "budgets", "goals", "debts"],
  goals: ["goals"],
  debts: ["debts", "transactions", "accounts", "categories", "budgets", "goals"],
};

function invalidate(client: QueryClient, root: Root) {
  return Promise.all(
    invalidates[root].map((r) => client.invalidateQueries({ queryKey: queryKeys[r] })),
  );
}

/** A query that waits for the data source and talks to the `Repository` only. */
export function useRepoQuery<T>(key: readonly unknown[], fn: (repo: Repository) => Promise<T>) {
  const data = useDataState();
  return useQuery({
    queryKey: key,
    queryFn: () => {
      if (data.status !== "ready") throw new Error("Data source not ready");
      return fn(data.repository);
    },
    enabled: data.status === "ready",
  });
}

export function useRepoMutation<TInput, TOutput>(
  root: Root,
  fn: (repo: Repository, input: TInput) => Promise<TOutput>,
) {
  const data = useDataState();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => {
      if (data.status !== "ready") throw new Error("Data source not ready");
      return fn(data.repository, input);
    },
    onSuccess: () => invalidate(client, root),
  });
}

/* ------------------------------------------------------------------ reads */

export const useAccounts = (options?: { includeArchived?: boolean }) =>
  useRepoQuery([...queryKeys.accounts, "list", options ?? {}], (r) => r.accounts.list(options));

/** Accounts with derived balances (opening balance + transactions). */
export const useAccountsWithBalances = (options?: { includeArchived?: boolean }) =>
  useRepoQuery([...queryKeys.accounts, "balances", options ?? {}], (r) =>
    r.accounts.listWithBalances(options),
  );

export const useAccountWithBalance = (id: string | undefined) =>
  useRepoQuery([...queryKeys.accounts, "detail", id ?? null], async (r) =>
    id ? r.accounts.getWithBalance(id) : null,
  );

export const useCategories = (options?: {
  includeArchived?: boolean;
  type?: "expense" | "income";
}) =>
  useRepoQuery([...queryKeys.categories, "list", options ?? {}], (r) => r.categories.list(options));

export const useTags = () => useRepoQuery([...queryKeys.tags, "list"], (r) => r.tags.list());

export const useTransactions = (filter?: TransactionFilter & { limit?: number; offset?: number }) =>
  useRepoQuery([...queryKeys.transactions, "list", filter ?? {}], (r) =>
    r.transactions.list(filter),
  );

export const useTransactionCount = (filter?: TransactionFilter) =>
  useRepoQuery([...queryKeys.transactions, "count", filter ?? {}], (r) =>
    r.transactions.count(filter),
  );

export const useTransaction = (id: string | undefined) =>
  useRepoQuery([...queryKeys.transactions, "detail", id ?? null], async (r) =>
    id ? r.transactions.get(id) : null,
  );

/* -------------------------------------------------------------- mutations */

export const useCreateAccount = () =>
  useRepoMutation("accounts", (r, input: NewAccount) => r.accounts.create(input));
export const useUpdateAccount = () =>
  useRepoMutation("accounts", (r, input: { id: string; patch: AccountPatch }) =>
    r.accounts.update(input.id, input.patch),
  );
export const useReorderAccounts = () =>
  useRepoMutation("accounts", (r, ids: string[]) => r.accounts.reorder(ids));
export const useDeleteAccount = () =>
  useRepoMutation("accounts", (r, id: string) => r.accounts.delete(id));

export const useCategoryUsage = () =>
  useRepoQuery([...queryKeys.categories, "usage"], (r) => r.categories.usage());

export const useReorderCategories = () =>
  useRepoMutation("categories", (r, ids: string[]) => r.categories.reorder(ids));

export const useCreateCategory = () =>
  useRepoMutation("categories", (r, input: NewCategory) => r.categories.create(input));
export const useUpdateCategory = () =>
  useRepoMutation("categories", (r, input: { id: string; patch: CategoryPatch }) =>
    r.categories.update(input.id, input.patch),
  );
export const useDeleteCategory = () =>
  useRepoMutation("categories", (r, id: string) => r.categories.delete(id));

export const useCreateTag = () =>
  useRepoMutation("tags", (r, input: NewTag) => r.tags.create(input));
export const useUpdateTag = () =>
  useRepoMutation("tags", (r, input: { id: string; patch: TagPatch }) =>
    r.tags.update(input.id, input.patch),
  );
export const useDeleteTag = () => useRepoMutation("tags", (r, id: string) => r.tags.delete(id));

export const useCreateTransaction = () =>
  useRepoMutation("transactions", (r, input: NewTransaction) => r.transactions.create(input));
export const useUpdateTransaction = () =>
  useRepoMutation("transactions", (r, input: { id: string; patch: TransactionPatch }) =>
    r.transactions.update(input.id, input.patch),
  );
export const useDeleteTransaction = () =>
  useRepoMutation("transactions", (r, id: string) => r.transactions.delete(id));

export const useCreateTransfer = () =>
  useRepoMutation("transactions", (r, input: NewTransfer) => r.transactions.createTransfer(input));
export const useUpdateTransfer = () =>
  useRepoMutation("transactions", (r, input: { id: string; patch: TransferPatch }) =>
    r.transactions.updateTransfer(input.id, input.patch),
  );

export const TRANSACTION_PAGE_SIZE = 100;

/** Transactions in pages of 100, loaded as the list scrolls (the full table can hold tens of thousands of rows). */
export const useTransactionPages = (filter: TransactionFilter & { sort?: TransactionSort }) => {
  const data = useDataState();
  return useInfiniteQuery({
    queryKey: [...queryKeys.transactions, "pages", filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      if (data.status !== "ready") throw new Error("Data source not ready");
      return data.repository.transactions.list({
        ...filter,
        limit: TRANSACTION_PAGE_SIZE,
        offset: pageParam,
      });
    },
    getNextPageParam: (last, all) =>
      last.length < TRANSACTION_PAGE_SIZE ? undefined : all.length * TRANSACTION_PAGE_SIZE,
    enabled: data.status === "ready",
  });
};

/** Applies one patch to many transactions atomically (all or none). Transfers must be filtered out by the caller. */
export const useBulkUpdateTransactions = () =>
  useRepoMutation("transactions", (r, input: { ids: string[]; patch: TransactionPatch }) =>
    r.transaction(async (tx) => {
      for (const id of input.ids) await tx.transactions.update(id, input.patch);
    }),
  );

/** Deletes many transactions atomically. Selecting both legs of a transfer is fine. */
export const useBulkDeleteTransactions = () =>
  useRepoMutation("transactions", (r, ids: string[]) =>
    r.transaction(async (tx) => {
      for (const id of ids) {
        if (await tx.transactions.get(id)) await tx.transactions.delete(id);
      }
    }),
  );

export const useCashflow = (range: DateRange) =>
  useRepoQuery([...queryKeys.transactions, "cashflow", range], (r) =>
    r.transactions.cashflow(range),
  );

export const useSpendingByCategory = (range: DateRange) =>
  useRepoQuery([...queryKeys.transactions, "spending", range], (r) =>
    r.transactions.spendingByCategory(range),
  );

/* ---------------------------------------------------------------- budgets */

export const useBudgets = () =>
  useRepoQuery([...queryKeys.budgets, "list"], (r) => r.budgets.list());

export const useCreateBudget = () =>
  useRepoMutation("budgets", (r, input: NewBudget) => r.budgets.create(input));
export const useUpdateBudget = () =>
  useRepoMutation("budgets", (r, input: { id: string; patch: BudgetPatch }) =>
    r.budgets.update(input.id, input.patch),
  );
export const useDeleteBudget = () =>
  useRepoMutation("budgets", (r, id: string) => r.budgets.delete(id));

export interface BudgetWithStatus {
  budget: Budget;
  /** Null only for a custom budget without an end date (cannot exist through the repository). */
  status: BudgetStatus | null;
}

/**
 * Every budget with where it stands on `today`. One entries query covers all budgets: it starts at the earliest
 * date any budget needs (the budget's start when it rolls over, else its current period).
 */
export const useBudgetStatuses = (today: string) =>
  useRepoQuery(
    [...queryKeys.budgets, "statuses", today],
    async (r): Promise<BudgetWithStatus[]> => {
      const budgets = await r.budgets.list();
      if (budgets.length === 0) return [];
      const categories = await r.categories.list({ includeArchived: true });
      const froms = budgets.map((b) => entriesNeededFrom(b, today)).filter((d): d is string => !!d);
      const from = [today, ...froms].sort()[0] ?? today;
      const entries = await r.transactions.spendEntries({ from, to: "9999-12-31" });
      return budgets.map((budget) => ({
        budget,
        status: budgetStatus(
          budget,
          entries.filter((e) => e.currency === budget.currency),
          today,
          expandCategoryIds(budget.scope.categoryIds, categories),
        ),
      }));
    },
  );
