import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountPatch,
  CategoryPatch,
  NewAccount,
  NewCategory,
  NewTag,
  NewTransaction,
  Repository,
  TagPatch,
  TransactionFilter,
  TransactionPatch,
} from "@wallt/db";
import { useDataState } from "./RepositoryProvider";

/** Query-key roots. Mutations invalidate by root, so every list/detail under it refetches. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  tags: ["tags"] as const,
  transactions: ["transactions"] as const,
};

type Root = keyof typeof queryKeys;

/**
 * What a write invalidates. Transactions change derived account balances, so they also invalidate accounts;
 * deleting an account/category/tag changes how transactions are shown.
 */
const invalidates: Record<Root, Root[]> = {
  accounts: ["accounts", "transactions"],
  categories: ["categories", "transactions"],
  tags: ["tags", "transactions"],
  transactions: ["transactions", "accounts"],
};

function invalidate(client: QueryClient, root: Root) {
  return Promise.all(
    invalidates[root].map((r) => client.invalidateQueries({ queryKey: queryKeys[r] })),
  );
}

/** A query that waits for the data source and talks to the `Repository` only. */
function useRepoQuery<T>(key: readonly unknown[], fn: (repo: Repository) => Promise<T>) {
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

function useRepoMutation<TInput, TOutput>(
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
