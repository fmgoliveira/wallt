/** Every synced table (PLAN §3.3), i.e. those with the common columns of §3.2. Server-only tables are never listed. */
export const SYNC_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "transaction_splits",
  "tags",
  "transaction_tags",
  "budgets",
  "recurring_rules",
  "goals",
  "debts",
  "rules",
  "payee_aliases",
  "attachments",
  "import_profiles",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export const isSyncTable = (name: unknown): name is SyncTable =>
  typeof name === "string" && (SYNC_TABLES as readonly string[]).includes(name);
