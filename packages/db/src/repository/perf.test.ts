import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createTestRepository } from "./test-utils";

/**
 * Performance check on a 50k-transaction ledger (plan §10 P7.2: dashboard < 300 ms). Off by default because it
 * seeds a lot of rows; run it with `WALLT_PERF=1 pnpm --filter @wallt/db test perf`. It times the queries behind
 * the dashboard and the transactions list on Node's SQLite, so it catches slow SQL (missing indexes, full scans);
 * device numbers (expo-sqlite, WASM on web) are slower by a roughly constant factor.
 */
const ROWS = 50_000;
const enabled = process.env.WALLT_PERF === "1";

async function time<T>(label: string, fn: () => Promise<T>, runs = 3) {
  const times: number[] = [];
  let out: T | undefined;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    out = await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const ms = times[Math.floor(times.length / 2)] ?? 0;
  console.log(`  ${label.padEnd(42)} ${ms.toFixed(1).padStart(8)} ms`);
  return { ms, out: out as T };
}

describe.skipIf(!enabled)("50k transactions", () => {
  it("keeps the dashboard queries fast", async () => {
    const { repo, raw } = await createTestRepository();
    const accounts: Awaited<ReturnType<typeof repo.accounts.create>>[] = [];
    for (const name of ["Checking", "Savings", "Card", "Cash", "Broker"]) {
      accounts.push(
        await repo.accounts.create({ name, type: "checking", currency: "EUR", openingBalance: 0 }),
      );
    }
    const categories: Awaited<ReturnType<typeof repo.categories.create>>[] = [];
    for (let i = 0; i < 20; i++) {
      categories.push(await repo.categories.create({ name: `Category ${i}`, type: "expense" }));
    }
    const base = await repo.transactions.create({
      accountId: accounts[0]?.id ?? "",
      amount: -1,
      currency: "EUR",
      bookingDate: "2026-01-01",
    });
    const sample = raw.prepare("SELECT * FROM transactions WHERE id = ?").get(base.id) as Record<
      string,
      unknown
    >;
    raw.prepare("DELETE FROM transactions WHERE id = ?").run(base.id);

    // Bulk-load (one SQL transaction), spread over ~5 years up to "today".
    const cols = Object.keys(sample);
    const insert = raw.prepare(
      `INSERT INTO transactions (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    );
    const today = new Date(Date.UTC(2026, 10, 8));
    raw.exec("BEGIN");
    for (let i = 0; i < ROWS; i++) {
      const d = new Date(today.getTime() - Math.floor((i / ROWS) * 5 * 365) * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      const row = {
        ...sample,
        id: `0190a5c4-7b1e-7a3f-8c2d-${String(i).padStart(12, "0")}`,
        account_id: accounts[i % accounts.length]?.id,
        category_id: categories[i % categories.length]?.id,
        amount: i % 17 === 0 ? 150_000 : -((i % 97) * 100 + 99),
        booking_date: date,
        value_date: date,
        payee: `Payee ${i % 400}`,
        description_raw: `CARD PURCHASE ${i % 400} REF ${i}`,
        description_clean: `Payee ${i % 400}`,
        needs_review: i % 500 === 0 ? 1 : 0,
        created_at: `${date}T10:00:00.000Z`,
        updated_at: `${date}T10:00:00.000Z`,
      } as Record<string, unknown>;
      insert.run(...(cols.map((c) => row[c]) as never[]));
    }
    raw.exec("COMMIT");
    expect(await repo.transactions.count()).toBe(ROWS);

    const month = { from: "2026-11-01", to: "2026-11-30" };
    console.log(`\n  ${ROWS} transactions (median of 3, Node SQLite)`);

    // What the dashboard runs on open (see apps/app/src/dashboard/Dashboard.tsx).
    // One at a time: SQLite is synchronous, so timing them concurrently would add everyone's time to each.
    const parts = [
      await time("accounts with balances", () => repo.accounts.listWithBalances()),
      await time("cashflow (month)", () => repo.transactions.cashflow(month)),
      await time("spending by category (month)", () => repo.transactions.spendingByCategory(month)),
      await time("recent 8", () => repo.transactions.list({ limit: 8 })),
      await time("count", () => repo.transactions.count()),
      await time("spend entries for budgets (month)", () => repo.transactions.spendEntries(month)),
    ];
    const dashboard = parts.reduce((sum, p) => sum + p.ms, 0);
    console.log(
      `  ${"dashboard total (sequential sum)".padEnd(42)} ${dashboard.toFixed(1).padStart(8)} ms`,
    );

    // The transactions screen.
    await time("list page 1 (100)", () => repo.transactions.list({ limit: 100 }));
    await time("list page 400 (offset 39 900)", () =>
      repo.transactions.list({ limit: 100, offset: 39_900 }),
    );
    await time("list filtered by account", () =>
      repo.transactions.list({ accountIds: [accounts[1]?.id ?? ""], limit: 100 }),
    );
    await time("list filtered by category", () =>
      repo.transactions.list({ categoryIds: [categories[3]?.id ?? ""], limit: 100 }),
    );
    await time('list search "payee 12"', () =>
      repo.transactions.list({ search: "payee 12", limit: 100 }),
    );
    await time("count search", () => repo.transactions.count({ search: "payee 12" }));
    await time("needs review count", () => repo.transactions.count({ needsReview: true }));
    await time("report entries (year)", () =>
      repo.transactions.reportEntries({ from: "2026-01-01", to: "2026-12-31" }),
    );
    await time("daily totals (all time)", () => repo.transactions.dailyTotals?.());

    expect(dashboard).toBeLessThan(300);
  }, 120_000);
});
