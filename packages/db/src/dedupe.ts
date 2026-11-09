import type { SqlExecutor } from "./migrate";

export type Stamp = () => { now: string; hlc: string };

/** JSON columns that can name a category id, as `[table, column]`. */
const JSON_REFS = [
  ["budgets", "scope"],
  ["recurring_rules", "template"],
  ["rules", "conditions"],
  ["rules", "action"],
] as const;

/** Replace every string equal to a duplicate id by the kept id; arrays of strings lose repeated entries. */
function remap(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return map.get(value) ?? value;
  if (Array.isArray(value)) {
    const out = value.map((v) => remap(v, map));
    return out.every((v) => typeof v === "string") ? [...new Set(out)] : out;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, map)]));
  }
  return value;
}

/**
 * Merges duplicate default categories. Every device seeds its own copy of the defaults (ids differ, `system_key`
 * is the same), so after sync a user holds N copies. Per `(user_id, system_key)` the live row with the smallest id
 * is kept (UUIDv7: the earliest; every device picks the same one, so they converge); all references (children,
 * transactions, splits, budget/recurring/rule JSON) move to it and the other copies are soft-deleted. Idempotent:
 * references to already-deleted copies (late pushes from an offline device) are also moved on the next run.
 * Writes go through the normal outbox triggers, so the merge syncs like any edit. Returns copies tombstoned.
 */
export async function dedupeSystemCategories(db: SqlExecutor, stamp: Stamp): Promise<number> {
  const rows = await db.all<{
    id: string;
    user_id: string;
    system_key: string;
    deleted_at: string | null;
  }>(
    "SELECT id, user_id, system_key, deleted_at FROM categories WHERE system_key IS NOT NULL ORDER BY id",
  );
  const keep = new Map<string, string>();
  for (const r of rows) {
    const k = `${r.user_id}|${r.system_key}`;
    if (!r.deleted_at && !keep.has(k)) keep.set(k, r.id);
  }
  const map = new Map<string, string>();
  const toDelete: string[] = [];
  for (const r of rows) {
    const kept = keep.get(`${r.user_id}|${r.system_key}`);
    if (!kept || kept === r.id) continue;
    map.set(r.id, kept);
    if (!r.deleted_at) toDelete.push(r.id);
  }
  if (map.size === 0) return 0;

  return db.transaction(async () => {
    for (const [dup, kept] of map) {
      for (const [table, col] of [
        ["categories", "parent_id"],
        ["transactions", "category_id"],
        ["transaction_splits", "category_id"],
      ] as const) {
        const hit = await db.all<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ? AND deleted_at IS NULL`,
          [dup],
        );
        if (Number(hit[0]?.n ?? 0) === 0) continue;
        const s = stamp();
        await db.run(
          `UPDATE ${table} SET ${col} = ?, updated_at = ?, hlc = ? WHERE ${col} = ? AND deleted_at IS NULL`,
          [kept, s.now, s.hlc, dup],
        );
      }
    }
    for (const [table, col] of JSON_REFS) {
      const live = await db.all<{ id: string; v: string }>(
        `SELECT id, ${col} AS v FROM ${table} WHERE deleted_at IS NULL`,
      );
      for (const row of live) {
        let next: string;
        try {
          next = JSON.stringify(remap(JSON.parse(row.v), map));
        } catch {
          continue;
        }
        if (next === row.v) continue;
        const s = stamp();
        await db.run(`UPDATE ${table} SET ${col} = ?, updated_at = ?, hlc = ? WHERE id = ?`, [
          next,
          s.now,
          s.hlc,
          row.id,
        ]);
      }
    }
    for (const id of toDelete) {
      const s = stamp();
      await db.run("UPDATE categories SET deleted_at = ?, updated_at = ?, hlc = ? WHERE id = ?", [
        s.now,
        s.now,
        s.hlc,
        id,
      ]);
    }
    return toDelete.length;
  });
}
