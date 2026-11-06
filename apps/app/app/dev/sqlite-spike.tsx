// SPIKE (ADR 0002): expo-sqlite + Drizzle on web. Throwaway; remove once P2.3 lands.
import { count, desc, eq, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { openDatabaseAsync } from "expo-sqlite";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

const transactions = sqliteTable("spike_transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  amount: integer("amount").notNull(),
  bookingDate: text("booking_date").notNull(),
  payee: text("payee").notNull(),
});

type Result = Record<string, string | number | boolean>;

async function ms<T>(fn: () => T | Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const v = await fn();
  return [v, Math.round((performance.now() - t) * 10) / 10];
}

async function run(): Promise<Result> {
  const out: Result = {};
  const mark = (step: string) => {
    (globalThis as Record<string, unknown>).__step = step;
  };
  const g = globalThis as unknown as { crossOriginIsolated?: boolean };
  out.crossOriginIsolated = g.crossOriginIsolated ?? "n/a";
  const [sqlite, tOpen] = await ms(() => openDatabaseAsync("spike.db"));
  out.openMs = tOpen;
  mark("opened");
  const db = drizzle(sqlite);
  mark("drizzle");
  await sqlite.execAsync(`CREATE TABLE IF NOT EXISTS spike_transactions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount INTEGER NOT NULL,
    booking_date TEXT NOT NULL, payee TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tx_acc_date ON spike_transactions(account_id, booking_date);`);
  mark("created");
  const [before] = await db.select({ n: count() }).from(transactions);
  out.rowsBeforeRun = before?.n ?? 0; // >0 after reload => persistence works
  mark("counted");
  await db.delete(transactions);
  mark("deleted");

  const rows = Array.from({ length: 10_000 }, (_, i) => ({
    id: `id-${i}`,
    accountId: `acc-${i % 5}`,
    amount: ((i * 7919) % 20_000) - 10_000,
    bookingDate: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    payee: `Payee ${i % 300}`,
  }));
  // (A) Drizzle expo-sqlite driver = synchronous bridge on web; try several batch sizes.
  for (const batch of [500, 100, 20]) {
    try {
      await db.delete(transactions);
      const [, t] = await ms(async () => {
        for (let i = 0; i < rows.length; i += batch) {
          await db.insert(transactions).values(rows.slice(i, i + batch));
        }
      });
      out[`drizzleSyncInsert10k_batch${batch}_ms`] = t;
    } catch (e) {
      out[`drizzleSyncInsert10k_batch${batch}`] = `FAILED: ${String(e)}`;
    }
  }
  // (B) Raw async API in one transaction with a prepared statement.
  await db.delete(transactions);
  const [, tAsync] = await ms(async () => {
    await sqlite.withTransactionAsync(async () => {
      const stmt = await sqlite.prepareAsync(
        "INSERT INTO spike_transactions (id, account_id, amount, booking_date, payee) VALUES (?,?,?,?,?)",
      );
      try {
        for (const r of rows) {
          await stmt.executeAsync([r.id, r.accountId, r.amount, r.bookingDate, r.payee]);
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  });
  out.asyncRawInsert10kMs = tAsync;
  mark("inserted");
  const [list, tList] = await ms(() =>
    db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, "acc-1"))
      .orderBy(desc(transactions.bookingDate))
      .limit(100),
  );
  out.list100Ms = tList;
  out.listRows = list.length;
  const [agg, tAgg] = await ms(() =>
    db
      .select({ payee: transactions.payee, total: sum(transactions.amount) })
      .from(transactions)
      .groupBy(transactions.payee)
      .orderBy(sql`2 desc`)
      .limit(10),
  );
  out.aggregateGroupByMs = tAgg;
  out.aggregateRows = agg.length;
  const [, tUpd] = await ms(() =>
    db.update(transactions).set({ payee: "Renamed" }).where(eq(transactions.id, "id-42")),
  );
  out.updateOneMs = tUpd;
  const [, tDel] = await ms(() => db.delete(transactions).where(eq(transactions.id, "id-43")));
  out.deleteOneMs = tDel;
  const [after] = await db.select({ n: count() }).from(transactions);
  out.rowsAfterRun = after?.n ?? 0;
  return out;
}

export default function SqliteSpike() {
  const [result, setResult] = useState<Result | string>("not run");
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Pressable
        testID="run"
        onPress={() => {
          setResult("running…");
          run()
            .then((r) => {
              (globalThis as Record<string, unknown>).__spike = r;
              setResult(r);
            })
            .catch((e) => {
              (globalThis as Record<string, unknown>).__spike = { error: String(e) };
              setResult(`ERROR: ${String(e)}`);
            });
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Run SQLite spike</Text>
      </Pressable>
      <View>
        <Text selectable>
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </Text>
      </View>
    </ScrollView>
  );
}
