import {
  type Account,
  accountSchema,
  type Category,
  categorySchema,
  splitsError,
  type Tag,
  type Transaction,
  type TransactionSplit,
  tagSchema,
  transactionSchema,
  transactionSplitSchema,
  transactionTagSchema,
  transferLegs,
} from "@wallt/core";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import * as t from "../schema";
import { createDrizzle, type RawSqlExecutor, type WalltDb } from "./executor";
import type { Stamper } from "./stamper";
import {
  type AccountPatch,
  type AccountWithBalance,
  type CategoryPatch,
  type NewAccount,
  type NewCategory,
  type NewSplit,
  type NewTag,
  type NewTransaction,
  type NewTransfer,
  type Repository,
  RepositoryError,
  type TagPatch,
  type TransactionDetail,
  type TransactionFilter,
  type TransactionPatch,
  type TransferPatch,
} from "./types";

const notFound = (what: string, id: string) =>
  new RepositoryError("not_found", `${what} ${id} not found`);
const invalid = (message: string) => new RepositoryError("validation", message);

/** Minimal structural type for a Zod schema (this package does not depend on zod directly). */
interface Parser<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/** Parse with a core Zod schema; failures surface as `RepositoryError("validation")`. */
function validate<T>(schema: Parser<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.map(String).join(".") || "value";
    throw new RepositoryError("validation", `Invalid ${what}: ${where}: ${first?.message ?? "?"}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/* --------------------------------------------------------------- row mapping */

type TxRow = typeof t.transactions.$inferSelect;

function txFromRow(row: TxRow): Transaction {
  const { categorizationMethod, categorizationConfidence, needsReview, ...rest } = row;
  return {
    ...rest,
    categorization: {
      method: categorizationMethod as Transaction["categorization"]["method"],
      confidence: categorizationConfidence,
      needsReview,
    },
  } as Transaction;
}

function txToRow(tx: Transaction): TxRow {
  const { categorization, ...rest } = tx;
  return {
    ...rest,
    categorizationMethod: categorization.method,
    categorizationConfidence: categorization.confidence,
    needsReview: categorization.needsReview,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Local implementation of `Repository` over any async SQLite (`RawSqlExecutor`): expo-sqlite on Android,
 * node:sqlite / better-sqlite3 in tests. Statements run one at a time on the single connection, and
 * transactions are atomic and serialized, so concurrent callers never interleave inside someone else's BEGIN.
 */
export function createLocalRepository(exec: RawSqlExecutor, stamper: Stamper): Repository {
  const db: WalltDb = createDrizzle(exec);

  // One connection: serialize every operation (and transaction) through a queue.
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };

  const stamp = () => ({ updatedAt: stamper.now(), hlc: stamper.hlc() });
  const fresh = () => {
    const now = stamper.now();
    return {
      id: stamper.newId(),
      userId: stamper.userId,
      createdAt: now,
      updatedAt: now,
      hlc: stamper.hlc(),
      deletedAt: null,
      serverSeq: null,
    };
  };

  /* ----------------------------------------------------------- derived balances */

  /** Sum and count of non-deleted transactions per account (exact: integer minor units). */
  async function accountTotals(accountId?: string) {
    const rows = await db
      .select({
        accountId: t.transactions.accountId,
        total: sql<number>`coalesce(sum(${t.transactions.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(t.transactions)
      .where(
        and(
          isNull(t.transactions.deletedAt),
          accountId ? eq(t.transactions.accountId, accountId) : undefined,
        ),
      )
      .groupBy(t.transactions.accountId);
    return new Map(
      rows.map((r) => [r.accountId, { total: Number(r.total), count: Number(r.count) }]),
    );
  }

  /** Non-deleted transactions + splits that use each category (a transaction counts once per row that names it). */
  async function categoryUsage(categoryId?: string) {
    const out = new Map<string, number>();
    const add = (id: string | null, n: unknown) => {
      if (id) out.set(id, (out.get(id) ?? 0) + Number(n));
    };
    const tx = await db
      .select({ id: t.transactions.categoryId, n: sql<number>`count(*)` })
      .from(t.transactions)
      .where(
        and(
          isNull(t.transactions.deletedAt),
          categoryId ? eq(t.transactions.categoryId, categoryId) : undefined,
        ),
      )
      .groupBy(t.transactions.categoryId);
    for (const r of tx) add(r.id, r.n);
    const splits = await db
      .select({ id: t.transactionSplits.categoryId, n: sql<number>`count(*)` })
      .from(t.transactionSplits)
      .where(
        and(
          isNull(t.transactionSplits.deletedAt),
          categoryId ? eq(t.transactionSplits.categoryId, categoryId) : undefined,
        ),
      )
      .groupBy(t.transactionSplits.categoryId);
    for (const r of splits) add(r.id, r.n);
    return out;
  }

  function withBalance(a: Account, totals?: { total: number; count: number }): AccountWithBalance {
    return {
      ...a,
      balance: a.openingBalance + (totals?.total ?? 0),
      transactionCount: totals?.count ?? 0,
    };
  }

  /* ---------------------------------------------------------------- lookups */

  async function activeAccount(id: string): Promise<Account> {
    const [row] = await db
      .select()
      .from(t.accounts)
      .where(and(eq(t.accounts.id, id), isNull(t.accounts.deletedAt)));
    if (!row) throw notFound("Account", id);
    return row as Account;
  }

  async function activeCategory(id: string): Promise<Category> {
    const [row] = await db
      .select()
      .from(t.categories)
      .where(and(eq(t.categories.id, id), isNull(t.categories.deletedAt)));
    if (!row) throw notFound("Category", id);
    return row as Category;
  }

  async function activeTag(id: string): Promise<Tag> {
    const [row] = await db
      .select()
      .from(t.tags)
      .where(and(eq(t.tags.id, id), isNull(t.tags.deletedAt)));
    if (!row) throw notFound("Tag", id);
    return row as Tag;
  }

  async function activeTransaction(id: string): Promise<Transaction> {
    const [row] = await db
      .select()
      .from(t.transactions)
      .where(and(eq(t.transactions.id, id), isNull(t.transactions.deletedAt)));
    if (!row) throw notFound("Transaction", id);
    return txFromRow(row);
  }

  async function requireCategories(ids: (string | null | undefined)[]) {
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
      try {
        await activeCategory(id);
      } catch {
        throw invalid(`Category ${id} does not exist`);
      }
    }
  }

  /* ------------------------------------------------------------ transactions */

  async function loadDetail(tx: Transaction): Promise<TransactionDetail> {
    const splits = (await db
      .select()
      .from(t.transactionSplits)
      .where(
        and(eq(t.transactionSplits.transactionId, tx.id), isNull(t.transactionSplits.deletedAt)),
      )
      .orderBy(
        asc(t.transactionSplits.createdAt),
        asc(t.transactionSplits.id),
      )) as TransactionSplit[];
    const links = await db
      .select({ tagId: t.transactionTags.tagId })
      .from(t.transactionTags)
      .where(and(eq(t.transactionTags.transactionId, tx.id), isNull(t.transactionTags.deletedAt)))
      .orderBy(asc(t.transactionTags.createdAt), asc(t.transactionTags.id));
    return { ...tx, splits, tagIds: links.map((l) => l.tagId) };
  }

  function whereFor(filter: TransactionFilter): SQL | undefined {
    const c: (SQL | undefined)[] = [isNull(t.transactions.deletedAt)];
    if (filter.accountIds?.length) c.push(inArray(t.transactions.accountId, filter.accountIds));
    if (filter.categoryIds?.length) c.push(inArray(t.transactions.categoryId, filter.categoryIds));
    if (filter.kind) c.push(eq(t.transactions.kind, filter.kind));
    if (filter.status) c.push(eq(t.transactions.status, filter.status));
    if (filter.needsReview !== undefined)
      c.push(eq(t.transactions.needsReview, filter.needsReview));
    if (filter.from) c.push(gte(t.transactions.bookingDate, filter.from));
    if (filter.to) c.push(lte(t.transactions.bookingDate, filter.to));
    if (filter.minAmount !== undefined) c.push(gte(t.transactions.amount, filter.minAmount));
    if (filter.maxAmount !== undefined) c.push(lte(t.transactions.amount, filter.maxAmount));
    if (filter.search?.trim()) {
      const q = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      const col = (x: unknown) => sql`lower(${x}) like ${q} escape '\\'`;
      c.push(
        or(
          col(t.transactions.payee),
          col(t.transactions.descriptionClean),
          col(t.transactions.descriptionRaw),
          col(t.transactions.notes),
        ),
      );
    }
    if (filter.tagIds?.length) {
      c.push(
        inArray(
          t.transactions.id,
          db
            .select({ id: t.transactionTags.transactionId })
            .from(t.transactionTags)
            .where(
              and(
                inArray(t.transactionTags.tagId, filter.tagIds),
                isNull(t.transactionTags.deletedAt),
              ),
            ),
        ),
      );
    }
    return and(...c);
  }

  function checkSign(kind: Transaction["kind"], amount: number) {
    if (kind === "expense" && amount > 0)
      throw invalid("An expense must not have a positive amount");
    if (kind === "income" && amount < 0) throw invalid("Income must not have a negative amount");
  }

  function checkSplits(amount: number, splits: NewSplit[]) {
    // The rule lives in core (integer minor units, exact) so the editor and imports share it.
    const problem = splitsError(amount, splits);
    if (problem) throw invalid(problem);
  }

  /** Both legs of a transfer, source first. */
  async function transferPair(anyLeg: Transaction): Promise<[Transaction, Transaction]> {
    if (anyLeg.kind !== "transfer" || !anyLeg.transferPeerId) {
      throw invalid("Not a transfer");
    }
    const peer = await activeTransaction(anyLeg.transferPeerId);
    const pair = [anyLeg, peer];
    pair.sort((a, b) => a.amount - b.amount);
    return pair as [Transaction, Transaction];
  }

  function legsOf(amount: number) {
    try {
      return transferLegs(amount);
    } catch (error) {
      throw invalid(error instanceof Error ? error.message : "Invalid transfer amount");
    }
  }

  async function transferAccounts(fromId: string, toId: string) {
    if (fromId === toId) throw invalid("A transfer needs two different accounts");
    const from = await activeAccount(fromId).catch(() => {
      throw invalid(`Account ${fromId} does not exist`);
    });
    const to = await activeAccount(toId).catch(() => {
      throw invalid(`Account ${toId} does not exist`);
    });
    if (from.currency !== to.currency) {
      throw invalid("Transfers between currencies are not supported yet");
    }
    return { from, to };
  }

  function transferRow(
    base: Pick<Transaction, "bookingDate" | "status" | "notes" | "excludedFromReports">,
    account: Account,
    amount: number,
    peerId: string | null,
  ) {
    return validate(
      transactionSchema,
      {
        ...fresh(),
        accountId: account.id,
        amount,
        currency: account.currency,
        bookingDate: base.bookingDate,
        valueDate: null,
        payee: "",
        descriptionRaw: "",
        descriptionClean: "",
        categoryId: null,
        status: base.status,
        kind: "transfer",
        transferPeerId: peerId,
        notes: base.notes,
        excludedFromReports: base.excludedFromReports,
        source: "manual",
        externalId: null,
        dedupHash: "",
        importBatchId: null,
        debtId: null,
        categorization: { method: "none", confidence: 0, needsReview: false },
      },
      "transaction",
    );
  }

  async function writeSplits(txId: string, splits: NewSplit[]) {
    for (const s of splits) {
      const row = validate(
        transactionSplitSchema,
        {
          ...fresh(),
          transactionId: txId,
          categoryId: s.categoryId ?? null,
          amount: s.amount,
          note: s.note ?? "",
        },
        "split",
      );
      await db.insert(t.transactionSplits).values(row);
    }
  }

  async function tombstoneSplits(txId: string) {
    const rows = await db
      .select({ id: t.transactionSplits.id })
      .from(t.transactionSplits)
      .where(
        and(eq(t.transactionSplits.transactionId, txId), isNull(t.transactionSplits.deletedAt)),
      );
    for (const r of rows) {
      const now = stamp();
      await db
        .update(t.transactionSplits)
        .set({ ...now, deletedAt: now.updatedAt })
        .where(eq(t.transactionSplits.id, r.id));
    }
  }

  async function syncTags(txId: string, tagIds: string[]) {
    const wanted = new Set(tagIds);
    for (const id of wanted) {
      try {
        await activeTag(id);
      } catch {
        throw invalid(`Tag ${id} does not exist`);
      }
    }
    const current = await db
      .select({ id: t.transactionTags.id, tagId: t.transactionTags.tagId })
      .from(t.transactionTags)
      .where(and(eq(t.transactionTags.transactionId, txId), isNull(t.transactionTags.deletedAt)));
    const have = new Set(current.map((l) => l.tagId));
    for (const link of current) {
      if (wanted.has(link.tagId)) continue;
      const now = stamp();
      await db
        .update(t.transactionTags)
        .set({ ...now, deletedAt: now.updatedAt })
        .where(eq(t.transactionTags.id, link.id));
    }
    for (const tagId of wanted) {
      if (have.has(tagId)) continue;
      const row = validate(
        transactionTagSchema,
        { ...fresh(), transactionId: txId, tagId },
        "tag link",
      );
      await db.insert(t.transactionTags).values(row);
    }
  }

  async function tombstoneTagLinks(where: SQL | undefined) {
    const rows = await db
      .select({ id: t.transactionTags.id })
      .from(t.transactionTags)
      .where(and(where, isNull(t.transactionTags.deletedAt)));
    for (const r of rows) {
      const now = stamp();
      await db
        .update(t.transactionTags)
        .set({ ...now, deletedAt: now.updatedAt })
        .where(eq(t.transactionTags.id, r.id));
    }
  }

  /* ------------------------------------------------------------- build repo */

  function build(inTx: boolean): Repository {
    const run = <T>(fn: () => Promise<T>): Promise<T> => (inTx ? fn() : exclusive(fn));
    /** Multi-statement operation: atomic (own transaction) unless already inside one. */
    const atomic = <T>(fn: () => Promise<T>): Promise<T> =>
      inTx ? fn() : exclusive(() => exec.transaction(fn));

    const accounts: Repository["accounts"] = {
      list: (options) =>
        run(async () => {
          const conds = [isNull(t.accounts.deletedAt)];
          if (!options?.includeArchived) conds.push(eq(t.accounts.archived, false));
          return (await db
            .select()
            .from(t.accounts)
            .where(and(...conds))
            .orderBy(
              asc(t.accounts.sortOrder),
              asc(t.accounts.name),
              asc(t.accounts.id),
            )) as Account[];
        }),
      get: (id) =>
        run(async () => {
          const [row] = await db
            .select()
            .from(t.accounts)
            .where(and(eq(t.accounts.id, id), isNull(t.accounts.deletedAt)));
          return (row as Account | undefined) ?? null;
        }),
      create: (input: NewAccount) =>
        atomic(async () => {
          const [{ next } = { next: 0 }] = await db
            .select({ next: sql<number>`coalesce(max(${t.accounts.sortOrder}), -1) + 1` })
            .from(t.accounts);
          const row = validate(
            accountSchema,
            {
              ...fresh(),
              name: input.name,
              type: input.type,
              currency: input.currency,
              color: input.color ?? null,
              icon: input.icon ?? null,
              openingBalance: input.openingBalance,
              includeInNetWorth: input.includeInNetWorth ?? true,
              archived: input.archived ?? false,
              bankLinkId: input.bankLinkId ?? null,
              sortOrder: input.sortOrder ?? next,
            },
            "account",
          );
          await db.insert(t.accounts).values(row);
          return row;
        }),
      listWithBalances: (options) =>
        run(async () => {
          const conds = [isNull(t.accounts.deletedAt)];
          if (!options?.includeArchived) conds.push(eq(t.accounts.archived, false));
          const list = (await db
            .select()
            .from(t.accounts)
            .where(and(...conds))
            .orderBy(
              asc(t.accounts.sortOrder),
              asc(t.accounts.name),
              asc(t.accounts.id),
            )) as Account[];
          const totals = await accountTotals();
          return list.map((a) => withBalance(a, totals.get(a.id)));
        }),
      getWithBalance: (id) =>
        run(async () => {
          const [row] = await db
            .select()
            .from(t.accounts)
            .where(and(eq(t.accounts.id, id), isNull(t.accounts.deletedAt)));
          if (!row) return null;
          const totals = await accountTotals(id);
          return withBalance(row as Account, totals.get(id));
        }),
      reorder: (ids) =>
        atomic(async () => {
          for (const [position, id] of ids.entries()) {
            await activeAccount(id);
            await db
              .update(t.accounts)
              .set({ sortOrder: position, ...stamp() })
              .where(eq(t.accounts.id, id));
          }
        }),
      update: (id, patch: AccountPatch) =>
        atomic(async () => {
          const current = await activeAccount(id);
          if (patch.currency !== undefined && patch.currency !== current.currency) {
            const { count } = (await accountTotals(id)).get(id) ?? { count: 0 };
            if (count > 0) {
              throw invalid("Currency cannot change once the account has transactions");
            }
          }
          const row = validate(accountSchema, { ...current, ...patch, ...stamp() }, "account");
          await db.update(t.accounts).set(row).where(eq(t.accounts.id, id));
          return row;
        }),
      delete: (id) =>
        atomic(async () => {
          await activeAccount(id);
          // Never orphan transactions: an account that has any must be archived, not deleted.
          const { count } = (await accountTotals(id)).get(id) ?? { count: 0 };
          if (count > 0) {
            throw invalid(`Account has ${count} transaction(s): archive it instead of deleting`);
          }
          const now = stamp();
          await db
            .update(t.accounts)
            .set({ ...now, deletedAt: now.updatedAt })
            .where(eq(t.accounts.id, id));
        }),
    };

    const categories: Repository["categories"] = {
      list: (options) =>
        run(async () => {
          const conds = [isNull(t.categories.deletedAt)];
          if (!options?.includeArchived) conds.push(eq(t.categories.archived, false));
          if (options?.type) conds.push(eq(t.categories.type, options.type));
          return (await db
            .select()
            .from(t.categories)
            .where(and(...conds))
            .orderBy(
              asc(t.categories.sortOrder),
              asc(t.categories.name),
              asc(t.categories.id),
            )) as Category[];
        }),
      get: (id) =>
        run(async () => {
          const [row] = await db
            .select()
            .from(t.categories)
            .where(and(eq(t.categories.id, id), isNull(t.categories.deletedAt)));
          return (row as Category | undefined) ?? null;
        }),
      create: (input: NewCategory) =>
        atomic(async () => {
          await checkParent(input.parentId ?? null, input.type, null);
          const [{ next } = { next: 0 }] = await db
            .select({ next: sql<number>`coalesce(max(${t.categories.sortOrder}), -1) + 1` })
            .from(t.categories)
            .where(
              input.parentId
                ? eq(t.categories.parentId, input.parentId)
                : isNull(t.categories.parentId),
            );
          const row = validate(
            categorySchema,
            {
              ...fresh(),
              name: input.name,
              parentId: input.parentId ?? null,
              type: input.type,
              icon: input.icon ?? null,
              color: input.color ?? null,
              archived: input.archived ?? false,
              sortOrder: input.sortOrder ?? next,
              systemKey: input.systemKey ?? null,
            },
            "category",
          );
          await db.insert(t.categories).values(row);
          return row;
        }),
      usage: () => run(async () => Object.fromEntries(await categoryUsage())),
      reorder: (ids) =>
        atomic(async () => {
          const rows = [];
          for (const id of ids) rows.push(await activeCategory(id));
          const first = rows[0];
          if (first && rows.some((r) => r.parentId !== first.parentId || r.type !== first.type)) {
            throw invalid("Categories can only be reordered among siblings of the same type");
          }
          for (const [position, id] of ids.entries()) {
            await db
              .update(t.categories)
              .set({ sortOrder: position, ...stamp() })
              .where(eq(t.categories.id, id));
          }
        }),
      update: (id, patch: CategoryPatch) =>
        atomic(async () => {
          const current = await activeCategory(id);
          const merged = { ...current, ...patch, ...stamp() };
          if (merged.type !== current.type) {
            // Changing the type would strand children of the other type and mislabel history.
            const [child] = await db
              .select({ id: t.categories.id })
              .from(t.categories)
              .where(and(eq(t.categories.parentId, id), isNull(t.categories.deletedAt)))
              .limit(1);
            if (child) throw invalid("Move or remove the subcategories before changing the type");
            if ((await categoryUsage(id)).get(id)) {
              throw invalid("The type cannot change once the category has transactions");
            }
          }
          await checkParent(merged.parentId, merged.type, id);
          const row = validate(categorySchema, merged, "category");
          await db.update(t.categories).set(row).where(eq(t.categories.id, id));
          return row;
        }),
      delete: (id) =>
        atomic(async () => {
          await activeCategory(id);
          // History keeps its category: a used category must be archived, not deleted.
          const used = (await categoryUsage(id)).get(id) ?? 0;
          if (used > 0) {
            throw invalid(
              `Category is used by ${used} transaction(s): archive it instead of deleting`,
            );
          }
          const children = await db
            .select({ id: t.categories.id })
            .from(t.categories)
            .where(and(eq(t.categories.parentId, id), isNull(t.categories.deletedAt)));
          for (const child of children) {
            await db
              .update(t.categories)
              .set({ parentId: null, ...stamp() })
              .where(eq(t.categories.id, child.id));
          }
          const now = stamp();
          await db
            .update(t.categories)
            .set({ ...now, deletedAt: now.updatedAt })
            .where(eq(t.categories.id, id));
        }),
    };

    /** Two-level tree: a parent must exist, be a root, share the type, and not be the category itself. */
    async function checkParent(parentId: string | null, type: string, selfId: string | null) {
      if (parentId === null) return;
      if (parentId === selfId) throw invalid("A category cannot be its own parent");
      const parent = await activeCategory(parentId).catch(() => {
        throw invalid(`Parent category ${parentId} does not exist`);
      });
      if (parent.parentId !== null) throw invalid("Categories have at most two levels");
      if (parent.type !== type)
        throw invalid("A subcategory must have the same type as its parent");
      if (selfId) {
        const [child] = await db
          .select({ id: t.categories.id })
          .from(t.categories)
          .where(and(eq(t.categories.parentId, selfId), isNull(t.categories.deletedAt)))
          .limit(1);
        if (child) throw invalid("A category with subcategories cannot become a subcategory");
      }
    }

    const tags: Repository["tags"] = {
      list: () =>
        run(
          async () =>
            (await db
              .select()
              .from(t.tags)
              .where(isNull(t.tags.deletedAt))
              .orderBy(asc(t.tags.name), asc(t.tags.id))) as Tag[],
        ),
      create: (input: NewTag) =>
        atomic(async () => {
          const row = validate(
            tagSchema,
            { ...fresh(), name: input.name, color: input.color ?? null },
            "tag",
          );
          await db.insert(t.tags).values(row);
          return row;
        }),
      update: (id, patch: TagPatch) =>
        atomic(async () => {
          const current = await activeTag(id);
          const row = validate(tagSchema, { ...current, ...patch, ...stamp() }, "tag");
          await db.update(t.tags).set(row).where(eq(t.tags.id, id));
          return row;
        }),
      delete: (id) =>
        atomic(async () => {
          await activeTag(id);
          await tombstoneTagLinks(eq(t.transactionTags.tagId, id));
          const now = stamp();
          await db
            .update(t.tags)
            .set({ ...now, deletedAt: now.updatedAt })
            .where(eq(t.tags.id, id));
        }),
    };

    const transactions: Repository["transactions"] = {
      list: (filter = {}) =>
        run(async () => {
          const rows = await db
            .select()
            .from(t.transactions)
            .where(whereFor(filter))
            .orderBy(
              desc(t.transactions.bookingDate),
              desc(t.transactions.createdAt),
              desc(t.transactions.id),
            )
            .limit(filter.limit ?? 100)
            .offset(filter.offset ?? 0);
          return rows.map(txFromRow);
        }),
      count: (filter = {}) =>
        run(async () => {
          const [row] = await db
            .select({ n: sql<number>`count(*)` })
            .from(t.transactions)
            .where(whereFor(filter));
          return Number(row?.n ?? 0);
        }),
      get: (id) =>
        run(async () => {
          const [row] = await db
            .select()
            .from(t.transactions)
            .where(and(eq(t.transactions.id, id), isNull(t.transactions.deletedAt)));
          return row ? loadDetail(txFromRow(row)) : null;
        }),
      create: (input: NewTransaction) =>
        atomic(async () => {
          const account = await activeAccount(input.accountId).catch(() => {
            throw invalid(`Account ${input.accountId} does not exist`);
          });
          if (account.currency !== input.currency) {
            throw invalid(
              `Transaction currency ${input.currency} differs from account ${account.currency}`,
            );
          }
          const kind = input.kind ?? (input.amount > 0 ? "income" : "expense");
          if (kind === "transfer") throw invalid("Use createTransfer for transfers");
          checkSign(kind, input.amount);
          const splits = input.splits ?? [];
          checkSplits(input.amount, splits);
          await requireCategories([input.categoryId, ...splits.map((s) => s.categoryId)]);

          const categorised = !!input.categoryId;
          const row = validate(
            transactionSchema,
            {
              ...fresh(),
              accountId: input.accountId,
              amount: input.amount,
              currency: input.currency,
              bookingDate: input.bookingDate,
              valueDate: input.valueDate ?? null,
              payee: input.payee ?? "",
              descriptionRaw: input.descriptionRaw ?? "",
              descriptionClean: input.descriptionClean ?? "",
              categoryId: input.categoryId ?? null,
              status: input.status ?? "booked",
              kind,
              transferPeerId: null,
              notes: input.notes ?? "",
              excludedFromReports: input.excludedFromReports ?? false,
              source: input.source ?? "manual",
              externalId: input.externalId ?? null,
              dedupHash: input.dedupHash ?? "",
              importBatchId: input.importBatchId ?? null,
              debtId: input.debtId ?? null,
              categorization: {
                method: categorised ? "user" : "none",
                confidence: categorised ? 1 : 0,
                needsReview: false,
              },
            },
            "transaction",
          );
          await db.insert(t.transactions).values(txToRow(row));
          await writeSplits(row.id, splits);
          if (input.tagIds?.length) await syncTags(row.id, input.tagIds);
          return loadDetail(row);
        }),
      update: (id, patch: TransactionPatch) =>
        atomic(async () => {
          const current = await activeTransaction(id);
          if (current.kind === "transfer" || patch.kind === "transfer") {
            throw invalid("Use updateTransfer to edit a transfer");
          }
          const { splits: newSplits, tagIds, ...fields } = patch;

          const merged: Transaction = { ...current, ...fields, ...stamp() };
          if (fields.categoryId !== undefined && fields.categorization === undefined) {
            const set = fields.categoryId !== null;
            merged.categorization = {
              method: set ? "user" : "none",
              confidence: set ? 1 : 0,
              needsReview: false,
            };
          }
          const account = await activeAccount(merged.accountId).catch(() => {
            throw invalid(`Account ${merged.accountId} does not exist`);
          });
          if (account.currency !== merged.currency) {
            throw invalid(
              `Transaction currency ${merged.currency} differs from account ${account.currency}`,
            );
          }
          checkSign(merged.kind, merged.amount);

          const existingSplits = newSplits ? null : await loadDetail(current).then((d) => d.splits);
          checkSplits(merged.amount, newSplits ?? existingSplits ?? []);
          await requireCategories([
            merged.categoryId,
            ...(newSplits ?? []).map((s) => s.categoryId),
          ]);

          const row = validate(transactionSchema, merged, "transaction");
          await db.update(t.transactions).set(txToRow(row)).where(eq(t.transactions.id, id));
          if (newSplits) {
            await tombstoneSplits(id);
            await writeSplits(id, newSplits);
          }
          if (tagIds) await syncTags(id, tagIds);
          return loadDetail(row);
        }),
      createTransfer: (input: NewTransfer) =>
        atomic(async () => {
          const { from, to } = await transferAccounts(input.fromAccountId, input.toAccountId);
          const legs = legsOf(input.amount);
          const base = {
            bookingDate: input.bookingDate,
            status: input.status ?? "booked",
            notes: input.notes ?? "",
            excludedFromReports: input.excludedFromReports ?? false,
          } as const;
          const out = transferRow(base, from, legs.from, null);
          const inn = transferRow(base, to, legs.to, out.id);
          await db.insert(t.transactions).values(txToRow(out));
          await db.insert(t.transactions).values(txToRow(inn));
          const linked = validate(
            transactionSchema,
            { ...out, transferPeerId: inn.id, ...stamp() },
            "transaction",
          );
          await db.update(t.transactions).set(txToRow(linked)).where(eq(t.transactions.id, out.id));
          return [await loadDetail(linked), await loadDetail(inn)] as [
            TransactionDetail,
            TransactionDetail,
          ];
        }),
      updateTransfer: (id, patch: TransferPatch) =>
        atomic(async () => {
          const [out, inn] = await transferPair(await activeTransaction(id));
          const { from, to } = await transferAccounts(
            patch.fromAccountId ?? out.accountId,
            patch.toAccountId ?? inn.accountId,
          );
          const legs = legsOf(patch.amount ?? inn.amount);
          const shared = {
            bookingDate: patch.bookingDate ?? out.bookingDate,
            status: patch.status ?? out.status,
            notes: patch.notes ?? out.notes,
            excludedFromReports: patch.excludedFromReports ?? out.excludedFromReports,
          };
          const nextOut = validate(
            transactionSchema,
            {
              ...out,
              ...shared,
              accountId: from.id,
              currency: from.currency,
              amount: legs.from,
              ...stamp(),
            },
            "transaction",
          );
          const nextIn = validate(
            transactionSchema,
            {
              ...inn,
              ...shared,
              accountId: to.id,
              currency: to.currency,
              amount: legs.to,
              ...stamp(),
            },
            "transaction",
          );
          await db
            .update(t.transactions)
            .set(txToRow(nextOut))
            .where(eq(t.transactions.id, out.id));
          await db.update(t.transactions).set(txToRow(nextIn)).where(eq(t.transactions.id, inn.id));
          return [await loadDetail(nextOut), await loadDetail(nextIn)] as [
            TransactionDetail,
            TransactionDetail,
          ];
        }),
      delete: (id) =>
        atomic(async () => {
          const current = await activeTransaction(id);
          // A transfer is two linked rows: deleting one side deletes both so balances stay consistent.
          const ids = [id];
          if (current.kind === "transfer" && current.transferPeerId) {
            const peer = await activeTransaction(current.transferPeerId).catch(() => null);
            if (peer) ids.push(peer.id);
          }
          for (const txId of ids) {
            await tombstoneSplits(txId);
            await tombstoneTagLinks(eq(t.transactionTags.transactionId, txId));
            const now = stamp();
            await db
              .update(t.transactions)
              .set({ ...now, deletedAt: now.updatedAt })
              .where(eq(t.transactions.id, txId));
          }
        }),
    };

    const self: Repository = {
      accounts,
      categories,
      tags,
      transactions,
      transaction: (fn) =>
        inTx ? fn(self) : exclusive(() => exec.transaction(() => fn(build(true)))),
    };
    return self;
  }

  return build(false);
}
