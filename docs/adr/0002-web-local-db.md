# ADR 0002 — Local DB on web (expo-sqlite WASM vs remote repository)

- Status: **Accepted** (owner, 2026-11-06)
- Issue: #4 · Plan: §2.1, §12

## Context
Android keeps a local SQLite copy and syncs. The web app could use the same code path (local SQLite in the
browser) or a `RemoteRepository` that calls the API directly. Both must sit behind one data-access interface.

## Spike
Prototype (throwaway, since removed from the repo) with `expo-sqlite` 58.0.15 + `drizzle-orm` 0.45.4,
Metro serving `Cross-Origin-Embedder-Policy: credentialless` + `Cross-Origin-Opener-Policy: same-origin`,
`.wasm` as an asset. Run in Chromium 152 (Claude desktop browser pane) on Windows, dev server only.
Table: 5 columns, composite index on (account_id, booking_date), 10,000 rows.

| Measurement | Result |
|---|---|
| `crossOriginIsolated` / SharedArrayBuffer | `true` with the two headers above |
| Open DB (async, cold) | ~180 ms |
| Persistence across page reloads (OPFS, AccessHandlePool VFS) | **Works** (rows from earlier runs were present after reload) |
| Insert 10k rows, raw **async** API, one transaction + prepared statement | **1.45 s** |
| Insert 10k rows, Drizzle (sync bridge), batches of 20 | **20.9 s** |
| Insert 10k rows, Drizzle (sync bridge), batches of 100 / 500 | **Fails: `Sync operation timeout`** |
| List 100 rows by account, ordered by date (indexed) | 58 ms |
| Aggregate sum group-by payee over 10k rows, top 10 | 19 ms |
| Single-row update / delete (autocommit) | 49 ms / 148 ms |

Bundle (production `expo export`): `wa-sqlite.wasm` 641 KB raw / ~315 KB gzip, worker chunk 143 KB,
plus the screen chunk (drizzle + expo-sqlite glue) 230 KB. The wasm loads lazily with the worker.

## Findings
1. **Local SQLite on web works** and persists via OPFS; read performance is fine for our data size (≈50k rows).
2. **The synchronous API is a trap on web.** It busy-waits on the main thread with a hard cap (1,000,000
   `Atomics.pause` iterations); any statement slower than that throws `Sync operation timeout`. It also blocks the UI.
   The first sync call before the worker is warm also failed in my first attempt. Use the **async API only** on web.
3. **Drizzle's `drizzle-orm/expo-sqlite` driver is built on the sync API**, so it is not usable for real work on web.
   Not tested here: `drizzle-orm/sqlite-proxy` over expo-sqlite's async API, which is the likely route.
4. Writes outside a transaction are slow (~50–150 ms each), so the repository layer must batch in transactions.
5. Cross-origin isolation needs the two headers in **production too**; the Hono server (P1.3/P1.5) must send them
   for the static web export. `credentialless` COEP also constrains third-party embeds.

## Not verified (open risks)
- Safari and Firefox (support for `credentialless` COEP and OPFS access handles differs by browser/version).
- A second browser tab on the same DB (AccessHandlePool VFS takes exclusive file handles, so likely only one tab can open it).
- Storage eviction policy / `navigator.storage.persist()` behaviour; clearing site data destroys local data
  (acceptable only because the server is the source of truth after sync).
- Android was not exercised in this spike.

## Options
- **A. Local SQLite on web** (same path as Android). Offline web, one code path, instant UI; costs: async-only
  driver work, header requirements, browser/multi-tab risks, 1 MB-ish extra payload.
- **B. `RemoteRepository` on web** (API calls only). No WASM, no multi-tab or eviction problems, simplest sync story
  (no web client sync); costs: no offline web, every interaction needs the network (fine for desktop-on-LAN/VPN), more API surface.

## Recommendation
**Define the repository interface as fully async and ship option B (`RemoteRepository`) for web first;
keep option A as a later opt-in implementation.** Reasons: the web app is a desktop-class client on the same
origin as the server, offline use is only required on Android (plan §1.1), and option A carries unverified
browser and multi-tab risks plus an extra sync client in the browser. The spike shows A is feasible, so the
interface must not preclude it (async-only, transactional batch API, no sync calls).

If you prefer A for parity with Android: the first P2.3 task is to prove Drizzle `sqlite-proxy` over the async
expo-sqlite API, and test Safari/Firefox and multi-tab, before building on it.

## Decision
Owner accepted the recommendation: async-only repository interface; `RemoteRepository` on web first; local SQLite on web deferred (revisit via a new ADR). The spike code and its dependencies were removed from the repo after the measurements were recorded here.

## Consequences (if recommendation accepted)
- P2.3 designs `Repository` as async-only with batch/transaction support; Android implementation uses expo-sqlite + Drizzle.
- Web gets `RemoteRepository` (requires the API endpoints earlier than the plan's P3); P3 sync client is Android-only at first.
- The COOP/COEP headers are not needed until option A is adopted; the spike-only Metro config change was reverted.
