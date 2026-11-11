import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema for synced tables (PLAN 3.2/3.3). Conventions:
 * - ids are UUIDv7 text generated on the client; dates are `YYYY-MM-DD` text; timestamps are UTC ISO text;
 * - money is integer minor units; JSON columns are text holding validated JSON (see @wallt/core schemas);
 * - no foreign-key constraints (sync can deliver a child before its parent); `*_id` columns are indexed.
 */

const synced = () => ({
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  hlc: text("hlc").notNull(),
  deletedAt: text("deleted_at"),
  serverSeq: integer("server_seq"),
});

const bool = (name: string) => integer(name, { mode: "boolean" }).notNull();

export const accounts = sqliteTable(
  "accounts",
  {
    ...synced(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    currency: text("currency").notNull(),
    color: text("color"),
    icon: text("icon"),
    openingBalance: integer("opening_balance").notNull(),
    includeInNetWorth: bool("include_in_net_worth"),
    archived: bool("archived"),
    bankLinkId: text("bank_link_id"),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("accounts_server_seq_idx").on(t.serverSeq)],
);

export const categories = sqliteTable(
  "categories",
  {
    ...synced(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    type: text("type").notNull(),
    icon: text("icon"),
    color: text("color"),
    archived: bool("archived"),
    sortOrder: integer("sort_order").notNull(),
    /** Stable key of a seeded default category; null for user-created ones. */
    systemKey: text("system_key"),
  },
  (t) => [
    index("categories_server_seq_idx").on(t.serverSeq),
    index("categories_parent_idx").on(t.parentId),
    index("categories_user_system_key_idx").on(t.userId, t.systemKey),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    ...synced(),
    accountId: text("account_id").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    bookingDate: text("booking_date").notNull(),
    valueDate: text("value_date"),
    payee: text("payee").notNull(),
    descriptionRaw: text("description_raw").notNull(),
    descriptionClean: text("description_clean").notNull(),
    categoryId: text("category_id"),
    status: text("status").notNull(),
    kind: text("kind").notNull(),
    transferPeerId: text("transfer_peer_id"),
    notes: text("notes").notNull(),
    excludedFromReports: bool("excluded_from_reports"),
    source: text("source").notNull(),
    externalId: text("external_id"),
    dedupHash: text("dedup_hash").notNull(),
    importBatchId: text("import_batch_id"),
    debtId: text("debt_id"),
    categorizationMethod: text("categorization_method").notNull(),
    categorizationConfidence: real("categorization_confidence").notNull(),
    needsReview: bool("needs_review"),
  },
  (t) => [
    index("transactions_server_seq_idx").on(t.serverSeq),
    index("transactions_account_date_idx").on(t.accountId, t.bookingDate),
    // month/period queries (dashboard, reports) and "newest first" lists filter and sort by date alone
    index("transactions_booking_date_idx").on(t.bookingDate),
    index("transactions_dedup_hash_idx").on(t.dedupHash),
    index("transactions_external_id_idx").on(t.externalId),
    index("transactions_needs_review_idx").on(t.needsReview),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_debt_idx").on(t.debtId),
  ],
);

export const transactionSplits = sqliteTable(
  "transaction_splits",
  {
    ...synced(),
    transactionId: text("transaction_id").notNull(),
    categoryId: text("category_id"),
    amount: integer("amount").notNull(),
    note: text("note").notNull(),
  },
  (t) => [
    index("transaction_splits_server_seq_idx").on(t.serverSeq),
    index("transaction_splits_tx_idx").on(t.transactionId),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    ...synced(),
    name: text("name").notNull(),
    color: text("color"),
  },
  (t) => [index("tags_server_seq_idx").on(t.serverSeq)],
);

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    ...synced(),
    transactionId: text("transaction_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (t) => [
    index("transaction_tags_server_seq_idx").on(t.serverSeq),
    index("transaction_tags_tx_idx").on(t.transactionId),
    index("transaction_tags_tag_idx").on(t.tagId),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    ...synced(),
    name: text("name").notNull(),
    period: text("period").notNull(),
    start: text("start").notNull(),
    end: text("end"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    rollover: bool("rollover"),
    /** JSON: { categoryIds, tagIds, accountIds } */
    scope: text("scope").notNull(),
  },
  (t) => [index("budgets_server_seq_idx").on(t.serverSeq)],
);

export const recurringRules = sqliteTable(
  "recurring_rules",
  {
    ...synced(),
    /** JSON: { payee, amount, currency, accountId, categoryId } */
    template: text("template").notNull(),
    rrule: text("rrule").notNull(),
    nextDate: text("next_date").notNull(),
    autoDetected: bool("auto_detected"),
    active: bool("active"),
  },
  (t) => [
    index("recurring_rules_server_seq_idx").on(t.serverSeq),
    index("recurring_rules_next_date_idx").on(t.nextDate),
  ],
);

export const goals = sqliteTable(
  "goals",
  {
    ...synced(),
    name: text("name").notNull(),
    targetAmount: integer("target_amount").notNull(),
    currency: text("currency").notNull(),
    deadline: text("deadline"),
    /** JSON array of account ids */
    accountIds: text("account_ids").notNull(),
    color: text("color"),
  },
  (t) => [index("goals_server_seq_idx").on(t.serverSeq)],
);

export const debts = sqliteTable(
  "debts",
  {
    ...synced(),
    person: text("person").notNull(),
    direction: text("direction").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    settled: bool("settled"),
  },
  (t) => [index("debts_server_seq_idx").on(t.serverSeq)],
);

export const rules = sqliteTable(
  "rules",
  {
    ...synced(),
    name: text("name").notNull(),
    /** JSON array of conditions */
    conditions: text("conditions").notNull(),
    /** JSON: { categoryId?, tagIds?, payeeRename? } */
    action: text("action").notNull(),
    priority: integer("priority").notNull(),
  },
  (t) => [
    index("rules_server_seq_idx").on(t.serverSeq),
    index("rules_priority_idx").on(t.userId, t.priority),
  ],
);

export const payeeAliases = sqliteTable(
  "payee_aliases",
  {
    ...synced(),
    pattern: text("pattern").notNull(),
    payee: text("payee").notNull(),
  },
  (t) => [index("payee_aliases_server_seq_idx").on(t.serverSeq)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    ...synced(),
    transactionId: text("transaction_id").notNull(),
    /** Device-independent key of the file (`<id>.<ext>`); the server keeps it under `attachments/<user>/<id>`. */
    filePath: text("file_path").notNull(),
    mime: text("mime").notNull(),
    /** Original file name, for display and sharing. */
    name: text("name").notNull().default(""),
    /** Bytes of the stored file. */
    size: integer("size").notNull().default(0),
    /** Hex SHA-256 of the stored file: the server checks uploads against it, devices check downloads. */
    sha256: text("sha256").notNull().default(""),
  },
  (t) => [
    index("attachments_server_seq_idx").on(t.serverSeq),
    index("attachments_tx_idx").on(t.transactionId),
  ],
);

/** Server-maintained, read-only on clients; not a synced row. `rate` is a decimal string. */
export const fxRates = sqliteTable(
  "fx_rates",
  {
    date: text("date").notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: text("rate").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.base, t.quote] })],
);

/** Synced (PLAN 5.2): user-editable bank file formats. `config` shape is defined by the import work (#34, #37). */
export const importProfiles = sqliteTable(
  "import_profiles",
  {
    ...synced(),
    name: text("name").notNull(),
    institution: text("institution"),
    defaultAccountId: text("default_account_id"),
    /** JSON array of header fingerprints */
    fingerprints: text("fingerprints").notNull(),
    /** JSON: decoding, columns, date format, sign rule, cleanup, ... */
    config: text("config").notNull(),
  },
  (t) => [index("import_profiles_server_seq_idx").on(t.serverSeq)],
);
