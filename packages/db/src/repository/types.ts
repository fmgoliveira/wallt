import type { Account, Category, Tag, Transaction, TransactionSplit } from "@wallt/core";

/**
 * Data-access interface (ADR 0002): fully async, no SQL, no sync calls. Android implements it on local SQLite
 * (`createLocalRepository`); web will implement it over the API (`RemoteRepository`). The UI only ever sees this.
 * Rows are validated with the `@wallt/core` Zod schemas, money is integer minor units, deletes are soft
 * (tombstones) so sync can propagate them.
 */

export type RepositoryErrorCode = "not_found" | "validation" | "conflict";

export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RepositoryError";
  }
}

/** Columns a repository stamps itself (id, owner, timestamps, clock, tombstone, server cursor). */
type Stamped = "id" | "userId" | "createdAt" | "updatedAt" | "hlc" | "deletedAt" | "serverSeq";

/* ---------------------------------------------------------------- accounts */

export type NewAccount = Pick<Account, "name" | "type" | "currency" | "openingBalance"> &
  Partial<
    Pick<Account, "color" | "icon" | "includeInNetWorth" | "archived" | "bankLinkId" | "sortOrder">
  >;
export type AccountPatch = Partial<Omit<Account, Stamped>>;

/**
 * An account with its derived balance (PLAN §3.1): `openingBalance` + the sum of its non-deleted transactions
 * (booked and pending), in integer minor units. Never stored, so it can never conflict during sync.
 */
export type AccountWithBalance = Account & { balance: number; transactionCount: number };

export interface AccountsRepository {
  /** Active accounts ordered by `sortOrder`, then name. Archived ones only with `includeArchived`. */
  list(options?: { includeArchived?: boolean }): Promise<Account[]>;
  /** Same as `list`, with each account's derived balance and transaction count. */
  listWithBalances(options?: { includeArchived?: boolean }): Promise<AccountWithBalance[]>;
  get(id: string): Promise<Account | null>;
  getWithBalance(id: string): Promise<AccountWithBalance | null>;
  /** Sets `sortOrder` to each account's position in `ids`; pass every account you want ordered. */
  reorder(ids: string[]): Promise<void>;
  create(input: NewAccount): Promise<Account>;
  update(id: string, patch: AccountPatch): Promise<Account>;
  /** Soft delete (tombstone). Refused (`validation`) while the account has transactions: archive it instead. */
  delete(id: string): Promise<void>;
}

/* -------------------------------------------------------------- categories */

export type NewCategory = Pick<Category, "name" | "type"> &
  Partial<Pick<Category, "parentId" | "icon" | "color" | "archived" | "sortOrder" | "systemKey">>;
export type CategoryPatch = Partial<Omit<Category, Stamped | "systemKey">>;

export interface CategoriesRepository {
  list(options?: { includeArchived?: boolean; type?: Category["type"] }): Promise<Category[]>;
  get(id: string): Promise<Category | null>;
  create(input: NewCategory): Promise<Category>;
  update(id: string, patch: CategoryPatch): Promise<Category>;
  /** Number of transactions/splits per category id (categories with none are absent). Derived, never stored. */
  usage(): Promise<Record<string, number>>;
  /** Sets sortOrder to the position in `ids`. All ids must share the same parent and type. */
  reorder(ids: string[]): Promise<void>;
  /**
   * Soft delete; children are re-parented to the root (a category tree never dangles). Refused (`validation`)
   * while any transaction or split uses it: archive it instead. The type cannot change once used or with children.
   */
  delete(id: string): Promise<void>;
}

/* -------------------------------------------------------------------- tags */

export type NewTag = Pick<Tag, "name"> & Partial<Pick<Tag, "color">>;
export type TagPatch = Partial<Omit<Tag, Stamped>>;

export interface TagsRepository {
  list(): Promise<Tag[]>;
  create(input: NewTag): Promise<Tag>;
  update(id: string, patch: TagPatch): Promise<Tag>;
  /** Soft delete the tag and its links to transactions. */
  delete(id: string): Promise<void>;
}

/* ------------------------------------------------------------ transactions */

export type NewSplit = Pick<TransactionSplit, "amount"> &
  Partial<Pick<TransactionSplit, "categoryId" | "note">>;

/** A transaction with its splits and tag ids (what the editor and detail panel need). */
export type TransactionDetail = Transaction & {
  splits: TransactionSplit[];
  tagIds: string[];
};

export type NewTransaction = Pick<
  Transaction,
  "accountId" | "amount" | "currency" | "bookingDate"
> &
  Partial<
    Pick<
      Transaction,
      | "valueDate"
      | "payee"
      | "descriptionRaw"
      | "descriptionClean"
      | "categoryId"
      | "status"
      | "kind"
      | "notes"
      | "excludedFromReports"
      | "source"
      | "externalId"
      | "dedupHash"
      | "importBatchId"
      | "debtId"
    >
  > & {
    splits?: NewSplit[];
    tagIds?: string[];
  };

export type TransactionPatch = Partial<Omit<Transaction, Stamped | "transferPeerId">> & {
  /** Replaces all splits when present (empty array removes them). */
  splits?: NewSplit[];
  /** Replaces all tag links when present. */
  tagIds?: string[];
};

/** A transfer between two of your accounts in the same currency. `amount` is positive minor units. */
export interface NewTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  bookingDate: string;
  notes?: string;
  status?: Transaction["status"];
  excludedFromReports?: boolean;
}
export type TransferPatch = Partial<NewTransfer>;

export interface TransactionFilter {
  accountIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  kind?: Transaction["kind"];
  status?: Transaction["status"];
  needsReview?: boolean;
  /** Inclusive `YYYY-MM-DD` bounds on `bookingDate`. */
  from?: string;
  to?: string;
  /** Case-insensitive substring over payee, descriptions and notes. */
  search?: string;
  /** Minor-unit bounds on the (signed) amount. */
  minAmount?: number;
  maxAmount?: number;
}

export interface TransactionsRepository {
  /** Newest booking date first (then newest created). `limit` defaults to 100. */
  list(filter?: TransactionFilter & { limit?: number; offset?: number }): Promise<Transaction[]>;
  count(filter?: TransactionFilter): Promise<number>;
  get(id: string): Promise<TransactionDetail | null>;
  create(input: NewTransaction): Promise<TransactionDetail>;
  update(id: string, patch: TransactionPatch): Promise<TransactionDetail>;
  /**
   * Creates the two linked rows of a transfer: `[source leg (negative), destination leg (positive)]`.
   * Transfers have no category, splits or tags. Different accounts, same currency (no FX yet).
   */
  createTransfer(input: NewTransfer): Promise<[TransactionDetail, TransactionDetail]>;
  /** Edits both legs together; `id` may be either leg. */
  updateTransfer(id: string, patch: TransferPatch): Promise<[TransactionDetail, TransactionDetail]>;
  /**
   * Soft delete the transaction, its splits and its tag links. Deleting either leg of a transfer deletes
   * both. `create`/`update` refuse the `transfer` kind: use the transfer methods.
   */
  delete(id: string): Promise<void>;
}

/* -------------------------------------------------------------- repository */

export interface Repository {
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  tags: TagsRepository;
  transactions: TransactionsRepository;
  /**
   * Runs `fn` atomically: everything commits together or not at all. Re-entrant (nested calls join the
   * outer transaction). Use it for batches: writes outside a transaction cost 50-150 ms each on web.
   */
  transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T>;
}
