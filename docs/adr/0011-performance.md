# 0011 — Performance on 50k transactions (P7.2)

## Context
Acceptance (#51): list scroll 60 fps on a mid-range Android, dashboard < 300 ms, web Lighthouse ≥ 90, on a 50 000-transaction ledger.

## What was measured
`packages/db/src/repository/perf.test.ts` seeds 50 000 transactions (5 accounts, 20 categories, ~5 years) and times the queries behind the dashboard and the transactions screen on Node's SQLite. It is off by default: `WALLT_PERF=1 pnpm --filter @wallt/db test perf --silent=false`. It fails if the dashboard queries sum to 300 ms or more.

Median of 3 runs (Node SQLite, one machine; indicative, not a device result):

| Query | ms |
|---|---|
| accounts with balances | 22 |
| cashflow (month) | 4 |
| spending by category (month) | 29 |
| recent 8 | 5 |
| count | 3 |
| spend entries for budgets (month) | 13 |
| **dashboard total** | **76** |
| list page 1 / page 400 | 7 / 24 |
| list by account / by category | 1 / 3 |
| search (LIKE) list / count | 31 / 31 |
| report entries (year) / daily totals (all time) | 27 / 30 |

## Changes
- Phone/tablet transactions list: rows are a memoised component and `renderItem` is stable, so appending a page or re-rendering the screen no longer re-renders the rows already on screen; batch rendering and clipped-subview removal are tuned. The desktop table already used fixed row heights (`getItemLayout`).

## Not verified here (needs a device or a Chrome run)
- 60 fps scroll on a mid-range Android phone.
- Dashboard end-to-end time on a device (expo-sqlite) and on web (SQLite WASM): the query side is ~76 ms on Node; the rest is rendering.
- Lighthouse ≥ 90 on the web build.

## Recommendations (not done: they need an owner decision)
- Several queries scan by date. An index on `transactions(booking_date)` would help the month queries and "recent". It is additive but a migration (schema version bump), so it was left for approval.
- Search is a `LIKE` scan (~31 ms at 50k). Fine now; an FTS table would be a larger change.
