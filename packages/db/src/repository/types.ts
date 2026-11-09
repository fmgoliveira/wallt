import type {
  Account,
  Budget,
  BudgetEntry,
  Category,
  Debt,
  FxRow,
  Goal,
  ImportProfile,
  RecurringRule,
  ReportEntry,
  Tag,
  Transaction,
  TransactionSplit,
} from "@wallt/core";

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

/* ----------------------------------------------------------------- budgets */

export type NewBudget = Pick<Budget, "name" | "period" | "start" | "amount" | "currency"> &
  Partial<Pick<Budget, "end" | "rollover" | "scope">>;
export type BudgetPatch = Partial<Omit<Budget, Stamped>>;

export interface BudgetsRepository {
  /** Active budgets, oldest first. */
  list(): Promise<Budget[]>;
  get(id: string): Promise<Budget | null>;
  /** Scope ids must exist (categories, tags, accounts); a custom period needs an end date. */
  create(input: NewBudget): Promise<Budget>;
  update(id: string, patch: BudgetPatch): Promise<Budget>;
  /** Soft delete (tombstone). */
  delete(id: string): Promise<void>;
}

/* ------------------------------------------------------------ goals & debts */

export type NewGoal = Pick<Goal, "name" | "targetAmount" | "currency"> &
  Partial<Pick<Goal, "deadline" | "accountIds" | "color">>;
export type GoalPatch = Partial<Omit<Goal, Stamped>>;

export interface GoalsRepository {
  /** Active goals, oldest first. Progress is derived from the linked accounts' balances, never stored. */
  list(): Promise<Goal[]>;
  get(id: string): Promise<Goal | null>;
  /** Linked accounts must exist. */
  create(input: NewGoal): Promise<Goal>;
  update(id: string, patch: GoalPatch): Promise<Goal>;
  delete(id: string): Promise<void>;
}

export type NewDebt = Pick<Debt, "person" | "direction" | "amount" | "currency"> &
  Partial<Pick<Debt, "settled">>;
export type DebtPatch = Partial<Omit<Debt, Stamped>>;

/**
 * A debt with what has been repaid so far, derived from the transactions linked to it (`debtId`): money received
 * for a debt you lent, money paid for one you borrowed. Never stored.
 */
export type DebtWithProgress = Debt & { repaid: number; repaymentCount: number };

export interface DebtsRepository {
  /** Open debts, newest first; settled ones only with `includeSettled`. */
  list(options?: { includeSettled?: boolean }): Promise<DebtWithProgress[]>;
  get(id: string): Promise<DebtWithProgress | null>;
  create(input: NewDebt): Promise<Debt>;
  update(id: string, patch: DebtPatch): Promise<Debt>;
  /** Soft delete; transactions linked to it are kept and unlinked. */
  delete(id: string): Promise<void>;
}

/* ---------------------------------------------------------------------- fx */

/**
 * ECB reference rates (units of `quote` per 1 EUR). Not a synced table: the server owns them and clients download
 * them through `GET /fx/rates` into the local copy of `fx_rates`. Nothing here goes through the outbox.
 */
export interface FxRepository {
  /** Rates with `from <= date <= to` (both optional), oldest first. */
  list(range?: { from?: string; to?: string }): Promise<FxRow[]>;
  /** Insert or update by (date, base, quote). */
  upsert(rows: readonly FxRow[]): Promise<void>;
  /** Newest date held, or null when there are no rates yet. */
  latestDate(): Promise<string | null>;
}

/* --------------------------------------------------------------- recurring */

export type NewRecurringRule = Pick<RecurringRule, "template" | "rrule" | "nextDate"> &
  Partial<Pick<RecurringRule, "autoDetected" | "active">>;
export type RecurringRulePatch = Partial<Omit<RecurringRule, Stamped>>;

export interface RecurringRepository {
  /** Active rules by next due date; paused ones only with `includeInactive`. */
  list(options?: { includeInactive?: boolean }): Promise<RecurringRule[]>;
  get(id: string): Promise<RecurringRule | null>;
  /** The RRULE must parse (see `parseRRule`); the template's account and category must exist and match its currency. */
  create(input: NewRecurringRule): Promise<RecurringRule>;
  update(id: string, patch: RecurringRulePatch): Promise<RecurringRule>;
  /** Soft delete (tombstone). Transactions already posted from the rule stay. */
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
    /** Imports flag ambiguous rows (possible duplicates) for the review queue. */
    needsReview?: boolean;
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

/** Column to order a transaction list by. Ties fall back to newest first. */
export interface TransactionSort {
  by: "date" | "amount" | "payee";
  dir: "asc" | "desc";
}

export interface TransactionFilter {
  accountIds?: string[];
  categoryIds?: string[];
  tagIds?: string[];
  kind?: Transaction["kind"];
  status?: Transaction["status"];
  needsReview?: boolean;
  /** Transactions linked to this debt (its repayments). */
  debtId?: string;
  /** Inclusive `YYYY-MM-DD` bounds on `bookingDate`. */
  from?: string;
  to?: string;
  /** Case-insensitive substring over payee, descriptions and notes. */
  search?: string;
  /** Minor-unit bounds on the (signed) amount. */
  minAmount?: number;
  maxAmount?: number;
}

/** Inclusive `YYYY-MM-DD` bounds. */
export interface DateRange {
  from: string;
  to: string;
}

/** Money in and out over a period, per currency. `expense` is negative (sign convention). Transfers and rows excluded from reports are left out. */
export interface Cashflow {
  currency: string;
  income: number;
  expense: number;
}

/** Spending (negative) per category and currency over a period; splits count towards their own category. `categoryId` null = uncategorised. */
export interface CategorySpend {
  categoryId: string | null;
  currency: string;
  total: number;
}

/** One expense, or one split of a split expense, in its own currency: the input of budget math. */
export type SpendEntry = BudgetEntry & { currency: string };

/** Optional narrowing of report entries; lists are "any of", dimensions combine with AND. */
export interface ReportFilter {
  accountIds?: string[];
  /** Matched against each entry's own category (a split's, for split transactions). */
  categoryIds?: string[];
  tagIds?: string[];
}

/** Everything a transaction did to one account on one day (transfers included), in the account's currency. */
export interface DailyTotal {
  date: string;
  accountId: string;
  total: number;
}

export interface TransactionsRepository {
  /** Newest booking date first (then newest created). `limit` defaults to 100. */
  list(
    filter?: TransactionFilter & { limit?: number; offset?: number; sort?: TransactionSort },
  ): Promise<Transaction[]>;
  count(filter?: TransactionFilter): Promise<number>;
  get(id: string): Promise<TransactionDetail | null>;
  create(input: NewTransaction): Promise<TransactionDetail>;
  update(id: string, patch: TransactionPatch): Promise<TransactionDetail>;
  /**
   * Creates the two linked rows of a transfer: `[source leg (negative), destination leg (positive)]`.
   * Transfers have no category, splits or tags. Different accounts, same currency (no FX yet).
   */
  /** Income and expense totals for a period, one row per currency. Computed in SQL, never stored. */
  cashflow(range: DateRange): Promise<Cashflow[]>;
  /** Expense totals per category for a period (largest spending first). Computed in SQL, never stored. */
  spendingByCategory(range: DateRange): Promise<CategorySpend[]>;
  /**
   * Expenses in a period as flat entries for budgets: a split transaction yields one entry per split (each with the
   * transaction's account and tags); transfers, income and rows excluded from reports are left out.
   */
  spendEntries(range: DateRange): Promise<SpendEntry[]>;
  /**
   * Income and expenses in a period as flat entries for reports (splits expanded, transfers and rows excluded from
   * reports left out), optionally narrowed by account, category and tag.
   */
  reportEntries(range: DateRange, filter?: ReportFilter): Promise<ReportEntry[]>;
  /**
   * Per account and day, the sum of all non-deleted transactions up to `to` (transfers included, whatever
   * `excludedFromReports` says: balances are real). With `opening` accounts' opening balances give net worth over time.
   */
  dailyTotals(to?: string): Promise<DailyTotal[]>;
  createTransfer(input: NewTransfer): Promise<[TransactionDetail, TransactionDetail]>;
  /**
   * Turns two existing transactions (opposite amounts, same currency, different accounts) into the two legs of
   * a transfer: category, splits and tags are dropped, as for any transfer. Returns `[negative leg, positive leg]`.
   */
  linkTransfer(aId: string, bId: string): Promise<[TransactionDetail, TransactionDetail]>;
  /**
   * Undo an import: soft-deletes every transaction stamped with `batchId`. A batch row that was linked to a
   * transaction outside the batch as a transfer is unlinked from it first, so the other account keeps its row.
   * Returns the number of transactions removed.
   */
  deleteImportBatch(batchId: string): Promise<number>;
  /** Edits both legs together; `id` may be either leg. */
  updateTransfer(id: string, patch: TransferPatch): Promise<[TransactionDetail, TransactionDetail]>;
  /**
   * Soft delete the transaction, its splits and its tag links. Deleting either leg of a transfer deletes
   * both. `create`/`update` refuse the `transfer` kind: use the transfer methods.
   */
  delete(id: string): Promise<void>;
}

/* -------------------------------------------------------------- repository */

export type NewImportProfile = Pick<ImportProfile, "name" | "fingerprints" | "config"> &
  Partial<Pick<ImportProfile, "institution" | "defaultAccountId">>;
export type ImportProfilePatch = Partial<Omit<ImportProfile, Stamped>>;

/** Saved bank file formats (PLAN 5.2): name, fingerprints and the detection/mapping config. Synced. */
export interface ImportProfilesRepository {
  /** Active profiles by name. */
  list(): Promise<ImportProfile[]>;
  get(id: string): Promise<ImportProfile | null>;
  create(input: NewImportProfile): Promise<ImportProfile>;
  update(id: string, patch: ImportProfilePatch): Promise<ImportProfile>;
  /** Soft delete (tombstone). */
  delete(id: string): Promise<void>;
}

export interface Repository {
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  tags: TagsRepository;
  transactions: TransactionsRepository;
  budgets: BudgetsRepository;
  recurring: RecurringRepository;
  fx: FxRepository;
  goals: GoalsRepository;
  debts: DebtsRepository;
  importProfiles: ImportProfilesRepository;
  /**
   * Runs `fn` atomically: everything commits together or not at all. Re-entrant (nested calls join the
   * outer transaction). Use it for batches: writes outside a transaction cost 50-150 ms each on web.
   */
  transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T>;
}
