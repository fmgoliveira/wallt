# ADR 0005 — Repository layer and local database (P2.3)

- Status: **Accepted** (owner answers in the P2.3 session, 2026-11-08)
- Issue: #16 · Plan: §2.1, §3, §4 · Builds on ADR 0002

## Context
ADR 0002 fixed the shape: one fully async `Repository` interface, local SQLite on Android, a `RemoteRepository` on web
(later). P2.3 builds the interface, the local implementation and the Query hooks. Three open points touched data
integrity or structure, so they were put to the owner.

## Decisions
1. **`user_id` before sign-in.** `user_id` is NOT NULL but the app has no sign-in until P3. `LocalRepository` stamps a
   caller-supplied `userId`; the app passes the constant `"local"`. **P3's first sign-in must run one explicit re-stamp of
   every row to the server user id** (owner review in P3: it touches synced data).
2. **HLC and outbox.** Writes go through an injected `Stamper` (`id` UUIDv7, `userId`, `now`, `hlc`); repositories never
   generate those themselves. P2.3 ships a local stamper with a *placeholder* HLC of the final shape
   (`<ms hex>-<counter hex>-<node>`, strictly increasing per device). There is **no outbox yet**: P3 swaps the stamper for the
   real HLC and adds the outbox at the same single choke point.
3. **Location.** `packages/db/src/repository` (interface, local implementation, stamper, executor). No new workspace
   package. Hooks and the expo-sqlite adapter live in `apps/app/src/data`.
4. **Scope.** Accounts, categories, tags, transactions + splits + tag links. Other tables are added by the phases that need
   them.

## Design
- **Drizzle over async SQLite.** `createDrizzle(executor)` uses the `sqlite-proxy` driver on top of a `RawSqlExecutor`
  (`SqlExecutor` + `values()` returning array rows, since Drizzle maps columns by position). Never the sync drivers
  (ADR 0002 finding 3). expo-sqlite uses `executeForRawResultAsync`; tests use `node:sqlite` with `setReturnArrays`.
- **One connection, serialized.** All operations run through a queue; `transaction(fn)` is atomic, re-entrant (nested
  calls join the outer one) and serialized, so a plain write can never land inside someone else's BEGIN.
- **Validation at the boundary** with the `@wallt/core` Zod schemas on the *merged* row; failures are
  `RepositoryError("validation")`. Money is integer minor units; rules enforced in the repository: expense amounts are not
  positive, income not negative, transaction currency equals the account currency, splits add up exactly, categories have
  at most two levels of one type.
- **Soft deletes** (tombstones) with fresh `updatedAt`/`hlc`; deleting a transaction/tag tombstones its splits/links,
  deleting a category re-parents its children. Lists exclude tombstones.
- **Manual transactions** get `categorization` = `user`/1 when a category is set, else `none`/0; `dedup_hash` is `""`
  until the import pipeline defines it (P5; dedup is an owner-review area).
- **Query hooks** (`apps/app/src/data/hooks.ts`): reads wait for the data source; writes invalidate by root key
  (transactions also invalidate accounts, since balances are derived).

## Consequences / open points
- **Web has no data source yet.** `database.ts` (web) rejects with a clear message. P2.4+ screens need either the
  `RemoteRepository` (server endpoints, planned earlier than P3 per ADR 0002) or an interim web store. This is a plan gap
  to settle before P2.4 is verified on web.
- Re-stamping `user_id` and replacing the stamper are P3 work items; neither needs a schema change.
- Derived account balances (P2.4) and transfers (P2.6) are not in the repository yet.
