import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION, type SqlExecutor } from "./migrate";
import { migrations } from "./migrations.generated";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  seedDefaultCategories,
} from "./seed";

/** Adapter over Node's built-in SQLite, standing in for better-sqlite3 / expo-sqlite. */
function open(): { db: SqlExecutor; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  const db: SqlExecutor = {
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    async run(sql, params = []) {
      raw.prepare(sql).run(...(params as never[]));
    },
    async transaction(fn) {
      raw.exec("BEGIN");
      try {
        const out = await fn();
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, raw };
}

let counter = 0;
const newId = () => `0190a5c4-7b1e-7a3f-8c2d-${String(++counter).padStart(12, "0")}`;
const ctx = (userId: string) => ({ userId, newId, now: "2024-01-01T00:00:00.000Z", hlc: "h0" });

const EXPECTED_TABLES = [
  "accounts",
  "attachments",
  "backup_runs",
  "budgets",
  "categories",
  "debts",
  "devices",
  "fx_rates",
  "goals",
  "import_profiles",
  "job_runs",
  "ml_models",
  "outbox",
  "payee_aliases",
  "recurring_rules",
  "refresh_tokens",
  "rules",
  "sync_meta",
  "tags",
  "transaction_splits",
  "transaction_tags",
  "transactions",
  "users",
];

describe("migrations", () => {
  it("apply cleanly on an empty DB and create every table", async () => {
    const { db, raw } = open();
    expect(await migrate(db)).toEqual(migrations.map((m) => m.tag));
    const tables = raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(EXPECTED_TABLES);
    expect(SCHEMA_VERSION).toBe(migrations.length);
  });
  it("are idempotent and rolled back on failure", async () => {
    const { db } = open();
    await migrate(db);
    expect(await migrate(db)).toEqual([]);
    await expect(
      migrate(db, [{ tag: "bad", statements: ["CREATE TABLE ok (a)", "NOT SQL"] }]),
    ).rejects.toThrow();
    expect(await db.all("SELECT name FROM sqlite_master WHERE name = 'ok'")).toEqual([]);
    expect(await db.all("SELECT tag FROM __migrations WHERE tag = 'bad'")).toEqual([]);
  });
  it("create the planned indexes", async () => {
    const { db, raw } = open();
    await migrate(db);
    const idx = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const name of [
      "transactions_account_date_idx",
      "transactions_dedup_hash_idx",
      "transactions_external_id_idx",
      "transactions_needs_review_idx",
      "transactions_server_seq_idx",
    ]) {
      expect(idx).toContain(name);
    }
  });
});

describe("seedDefaultCategories", () => {
  const total = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].reduce(
    (n, c) => n + 1 + (c.children?.length ?? 0),
    0,
  );

  it("inserts the default set with valid parents", async () => {
    const { db } = open();
    await migrate(db);
    expect(await seedDefaultCategories(db, ctx("u1"))).toBe(total);
    const orphans = await db.all(
      "SELECT c.id FROM categories c WHERE c.parent_id IS NOT NULL AND c.parent_id NOT IN (SELECT id FROM categories)",
    );
    expect(orphans).toEqual([]);
    const types = await db.all<{ type: string }>(
      "SELECT DISTINCT type FROM categories ORDER BY type",
    );
    expect(types.map((t) => t.type)).toEqual(["expense", "income"]);
  });
  it("is idempotent and never resurrects or overwrites user edits", async () => {
    const { db } = open();
    await migrate(db);
    await seedDefaultCategories(db, ctx("u1"));
    await db.run("UPDATE categories SET name = 'Mercado' WHERE system_key = 'groceries'");
    await db.run(
      "UPDATE categories SET deleted_at = '2024-02-01T00:00:00.000Z' WHERE system_key = 'gifts'",
    );
    expect(await seedDefaultCategories(db, ctx("u1"))).toBe(0);
    const n = (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM categories"))[0]?.n;
    expect(n).toBe(total);
    const [g] = await db.all<{ name: string }>(
      "SELECT name FROM categories WHERE system_key = 'groceries'",
    );
    expect(g?.name).toBe("Mercado");
  });
  it("seeds each user separately", async () => {
    const { db } = open();
    await migrate(db);
    await seedDefaultCategories(db, ctx("u1"));
    expect(await seedDefaultCategories(db, ctx("u2"))).toBe(total);
    const n = (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM categories"))[0]?.n;
    expect(n).toBe(total * 2);
  });
});

describe("server-only tables", () => {
  const user = (id: string, email: string) =>
    [
      "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, 'h', 't', 't')",
      [id, email],
    ] as const;

  it("enforce unique email and foreign keys, and cascade deletes", async () => {
    const { db } = open();
    await migrate(db);
    await db.run(...user("u1", "a@b.c"));
    await expect(db.run(...user("u2", "a@b.c"))).rejects.toThrow();
    await expect(
      db.run(
        "INSERT INTO devices (id, user_id, name, platform, created_at) VALUES ('d0', 'nope', 'x', 'web', 't')",
      ),
    ).rejects.toThrow();
    await db.run(
      "INSERT INTO devices (id, user_id, name, platform, created_at) VALUES ('d1', 'u1', 'x', 'web', 't')",
    );
    const token =
      "INSERT INTO refresh_tokens (id, user_id, device_id, token_hash, family_id, created_at, expires_at) VALUES (?, 'u1', 'd1', ?, 'f', 't', 't')";
    await db.run(token, ["r1", "hash"]);
    await expect(db.run(token, ["r2", "hash"])).rejects.toThrow();
    await db.run("DELETE FROM users WHERE id = 'u1'");
    expect(await db.all("SELECT id FROM devices")).toEqual([]);
    expect(await db.all("SELECT id FROM refresh_tokens")).toEqual([]);
  });
  it("default recovery codes to an empty JSON array", async () => {
    const { db } = open();
    await migrate(db);
    await db.run(...user("u1", "a@b.c"));
    const rows = await db.all<{ recovery_codes: string; failed_attempts: number }>(
      "SELECT recovery_codes, failed_attempts FROM users",
    );
    expect(rows[0]).toEqual({ recovery_codes: "[]", failed_attempts: 0 });
  });
});
