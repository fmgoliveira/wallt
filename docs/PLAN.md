# Wallt — Implementation Plan (Cashew-like personal finance app)

> Name: **Wallt**.
> Audience: a solo developer **or** an AI coding agent executing this plan task by task.
> Status: v1 draft — 2026-11-06.

---

## 0. Rules of engagement (read first)

**When in doubt, ask first.** If anything in this plan is ambiguous, contradicts itself, contradicts the codebase, or requires a decision not written here, **stop and ask the owner before writing code**. A wrong guess costs more than a question.

Always stop and ask before:
- Changing the tech stack, adding a heavy dependency (>100 kB gzipped on web, or anything native), or replacing a library chosen in an ADR.
- Changing the database schema in a way that is not purely additive, or touching the sync protocol.
- Anything involving money math, deduplication, or deleting/merging user data.
- Anything involving secrets, bank credentials, auth, backup/restore, or exposing the server to the internet.
- Signing up for a paid service, or accepting terms of a third-party API.
- Skipping or weakening tests or CI checks to make something pass.
- Expanding scope beyond the current task/issue.

How to ask: open a GitHub issue (or comment on the PR) labelled `question`, state the options you see, your recommendation, and what you will do if no answer arrives. Do not merge work that depends on an unanswered question.

---

## 1. Product scope

A self-hosted personal budget tracker with feature parity with Cashew, plus smart import.

### 1.1 Confirmed decisions
| Topic | Decision |
|---|---|
| Clients | **One Expo (React Native) codebase** → Android app + web app |
| Web quality | Web must be a **real responsive desktop experience** (sidebar, multi-column, tables, keyboard, hover), not a stretched phone UI |
| Data | **Offline-first** on Android (local SQLite) with sync to the server |
| Server | Docker container, **SQLite file DB**, automated **encrypted backups to Google Drive** |
| Banks | No bank connections (owner decision). Statements come in through the universal **file import** |
| Categorization | **Rules + local ML** (runs on your server, no data leaves it); low-confidence → review queue shown on app open |
| Design | Modern, identical design language on Android and web |
| Access | Public at **https://wallt.example.com** behind the host nginx (TLS terminated there); own auth with **mandatory 2FA (TOTP)** |
| Users | Single user in v1; **multi-user possibly later** → `user_id` on every row, every query scoped by it |
| Attachments | Receipts/files per transaction **in v1, optional** |

### 1.2 Assumptions (confirm or correct — ask if unsure)
- Deployed on a public Linux server in Docker, behind the nginx already running on the host (no Cloudflare Tunnel; decision changed in #12).
- Base currency EUR; other currencies supported per account.
- UI languages: Portuguese + English.

### 1.3 Feature list (v1)
**Accounts:** checking, savings, credit card, cash, meal card, investment (balance only), loan. Currency, color, icon, opening balance, archived, include-in-net-worth toggle. Bank-linked or manual.

**Transactions:** expense / income / transfer (between own accounts), amount, date, payee, description, category, tags, notes, split transactions (multiple categories), pending vs booked, optional attachments (receipt photos/PDFs), "excluded from reports" flag.

**Categories:** two levels (category → subcategory), icon, color, type (expense/income), archived; default PT-friendly set seeded on first run.

**Budgets:** monthly/weekly/custom period; total or per category(ies)/tags/accounts; rollover option; progress bars, daily "safe to spend", alert at 80%/100%.

**Recurring & subscriptions:** manual recurring rules + auto-detected recurring charges (same payee, similar amount, regular interval); upcoming bills list.

**Goals:** savings goals with target, deadline, linked account(s), progress.

**Debts/loans:** lent/borrowed to/from a person, partial repayments.

**Reports/graphics:** spending by category (donut), income vs expense per month (bars), cashflow over time (line), net worth (area), budget progress, category trend, calendar heatmap, top payees. All filterable by period/accounts/categories/tags.

**Other:** global search + filters, multi-currency with daily ECB rates, CSV/JSON export, privacy mode (hide amounts), biometric/PIN lock on Android, dark/light theme, notifications (budget alerts, "N transactions need review", upcoming bills), web command palette (⌘K).

**Out of scope for v1** (park as issues labelled `later`): investments tracking with prices, payments initiation, shared household budgets, iOS build, home-screen widgets, PDF statement import.

---

## 2. Architecture

```
┌──────────────── Expo app (one codebase) ────────────────┐
│ Android (native)              Web (react-native-web)     │
│  UI: packages/ui (design system, responsive layouts)     │
│  Data: local SQLite + Drizzle  ── sync client ──┐        │
└─────────────────────────────────────────────────┼────────┘
                                                  │ HTTPS (same origin on web)
┌─────────────── Docker: server ──────────────────▼────────┐
│ Hono API  · auth · /sync push/pull · /import              │
│ Serves the static Expo web export on the same origin      │
│ Jobs (cron): ML retrain · FX rates · backups              │
│ SQLite (WAL) on /data volume  — source of truth           │
└──────────────┬──────────────────────────┬────────────────┘
               │                          │
                                   Google Drive (encrypted backups)
```

### 2.1 Stack (pin exact versions in P0 and record them in `docs/adr/0001-stack.md`)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared packages, cached CI |
| Language | TypeScript strict everywhere | One language for app, server, ML |
| App | Expo (latest stable SDK), Expo Router, React Native Web | One codebase, file-based routing for both targets |
| Styling | NativeWind (Tailwind) + own components in `packages/ui` | Same tokens on web/native, real CSS media queries on web |
| Animation | Reanimated + Moti | Smooth 60fps micro-interactions |
| Charts | **Spike in P0:** Victory Native XL (Skia) vs react-native-gifted-charts (SVG) | Skia looks best but adds a WASM payload on web; pick by measured web bundle + visual quality |
| Local DB | expo-sqlite + Drizzle ORM | Same schema code on client and server |
| Web local DB | **Spike in P0:** expo-sqlite on web (WASM/OPFS). Fallback: web uses a `RemoteRepository` that calls the API directly | Keep one data-access interface either way |
| State | TanStack Query (server/derived data) + Zustand (UI state) | Simple, well known |
| Forms/validation | react-hook-form + Zod (schemas in `packages/core`) | Same validation on client and server |
| Server | Node LTS + Hono, better-sqlite3, Drizzle, croner | Small, fast, single container |
| Auth | Password (argon2id) + mandatory TOTP 2FA + recovery codes, per-device refresh tokens; optional passkey later | Public URL, multiple devices |
| Tests | Vitest (unit), Playwright (web e2e), Maestro (Android e2e, P7) | |
| Lint/format | Biome | One fast tool |
| Builds | GitHub Actions; Docker image → GHCR; Android APK via EAS Build (or local Gradle in CI) | |

### 2.2 Repository layout
```
wallt/
├─ apps/
│  ├─ app/            # Expo app (Android + web)
│  └─ server/         # Hono API + jobs + Dockerfile
├─ packages/
│  ├─ core/           # domain types, Zod schemas, money utils, business rules (pure TS, no IO)
│  ├─ db/             # Drizzle schema + migrations (shared by app & server)
│  ├─ sync/           # sync protocol types, HLC clock, client + server logic
│  ├─ ingest/         # import parsers, normalization, dedup (pure TS)
│  ├─ categorize/     # rules engine + ML classifier (pure TS)
│  ├─ ui/             # design tokens, components, layouts, charts wrappers
│  └─ config/         # tsconfig, biome, tailwind preset
├─ docs/
│  ├─ PLAN.md         # this file
│  ├─ adr/            # architecture decision records
│  └─ design/         # design spec, screenshots
├─ fixtures/          # anonymized sample bank exports (never real data)
├─ AGENTS.md          # agent rules (see Appendix A)
└─ docker-compose.yml
```

Rule: `core`, `ingest`, `categorize`, `sync` are **pure** (no React, no IO) → fully unit-testable and reusable on both sides.

---

## 3. Data model

### 3.1 Money & dates rules (non-negotiable)
- Amounts are **integers in minor units** (cents) + ISO currency code. Never floats. All math through `packages/core/money.ts`.
- Sign convention: negative = outflow, positive = inflow. Transfers = two linked transactions.
- `booking_date` is a calendar date (`YYYY-MM-DD`, no timezone). Timestamps are UTC ISO strings.
- Balances are **derived** (opening balance + sum of transactions), never stored as editable fields → no sync conflicts. Bank-reported balance is stored separately for reconciliation.

### 3.2 Common columns on every synced table
`id` (UUIDv7, text, generated on the client) · `user_id` · `created_at` · `updated_at` · `hlc` (hybrid logical clock string) · `deleted_at` (soft delete / tombstone) · `server_seq` (integer, assigned by server).

### 3.3 Tables
| Table | Key fields |
|---|---|
| `accounts` | name, type, currency, color, icon, opening_balance, include_in_net_worth, archived, bank_link_id?, sort_order |
| `categories` | name, parent_id?, type (expense/income), icon, color, archived, sort_order |
| `transactions` | account_id, amount, currency, booking_date, value_date?, payee, description_raw, description_clean, category_id?, status (pending/booked), kind (expense/income/transfer), transfer_peer_id?, notes, excluded_from_reports, source (manual/import/bank), external_id?, dedup_hash, import_batch_id?, categorization (method, confidence, needs_review) |
| `transaction_splits` | transaction_id, category_id, amount, note |
| `tags`, `transaction_tags` | name, color / join |
| `budgets` | name, period (month/week/custom), start, end?, amount, rollover, scope (json: category_ids, tag_ids, account_ids) |
| `recurring_rules` | template (payee, amount, account, category), rrule, next_date, auto_detected, active |
| `goals` | name, target_amount, deadline?, account_ids, color |
| `debts` | person, direction (lent/borrowed), amount, settled; repayments are transactions linked by `debt_id` |
| `rules` | user categorization rules: conditions (json), action (category, tags, payee rename), priority |
| `payee_aliases` | raw pattern → clean payee name |
| `attachments` | transaction_id, file path, mime |
| `fx_rates` | date, base, quote, rate (server-only, read-only on client) |
| `import_profiles` | name, institution?, default_account_id?, fingerprints (json), config (json) — synced (§5.2) |
| Server-only | `users`, `devices`, `refresh_tokens`, `bank_connections`, `bank_accounts`, `sync_log`, `ml_models`, `backup_runs`, `job_runs` |

Indexes: `transactions(account_id, booking_date)`, `transactions(dedup_hash)`, `transactions(external_id)`, `transactions(needs_review)`, `server_seq` on every synced table.

---

## 4. Sync engine (offline-first)

Custom, simple, and explicit (no third-party sync service, because they need Postgres and we want a single SQLite file).

- **Server is the source of truth.** Each device keeps a full local copy (single user → data is small; 10 years ≈ 50k transactions).
- **Client writes** go to local SQLite and into an `outbox` table (table, id, op, row snapshot, hlc).
- **Push** `POST /sync/push {deviceId, changes[]}` → server applies each change **last-writer-wins per row by HLC**, stores it, and assigns a monotonically increasing `server_seq`. Returns accepted/rejected + current row for rejected.
- **Pull** `GET /sync/pull?since=<seq>&limit=500` → rows changed after the cursor (including tombstones); client upserts and advances the cursor. Paginate until `hasMore=false`.
- Triggers: app start, app foreground, after local write (debounced 2 s), every 5 min while open, manual pull-to-refresh. Use a background task on Android if cheap; otherwise not needed.
- Rows created on the server (imports done on web, ML recategorization) simply arrive through pull.
- **Conflict policy:** LWW by row. Exception: `category_id` set by the user always beats one set by ML (`categorization.method = 'user'` wins regardless of HLC). Document in ADR.
- Schema migrations: client and server share `packages/db` migrations; the sync API sends `schemaVersion`; server refuses pushes from an older schema and the app asks the user to update.
- Tests: property-based tests (fast-check) simulating 2–3 devices with random offline edits → all converge to the same state.

---

## 5. Ingestion pipeline

```
source (file) → parse → normalize → dedup → categorize → store → sync to devices
```

- **Normalize:** trim, collapse whitespace, strip card-number fragments / reference codes / dates from descriptions → `description_clean`; apply `payee_aliases`; parse amounts and dates.
- **Dedup:** prefer `external_id` (bank's transaction id). Fallback `dedup_hash = sha256(account_id | booking_date | amount | normalized_description | occurrence_index)` where `occurrence_index` distinguishes genuine identical transactions on the same day. Pending → booked: match a pending tx with the same amount within ±5 days and similar description, then update it rather than insert. Any ambiguous match → mark `needs_review`, never silently drop. **Ask before changing dedup logic.**
- **Transfer detection:** opposite amounts on two own accounts within 3 days → suggest linking as a transfer (auto-link only at high confidence).
- Every import/bank run creates an `import_batch` that can be **undone** as a whole.

### 5.1 Universal file import ("any format, any columns")
Supported in v1: **CSV/TSV/TXT, XLS, XLSX, ODS** (SheetJS), **OFX/QFX**, **CAMT.053/052 XML**. PDF statements = `later`.

Steps:
1. **Decode:** detect encoding (UTF-8 / UTF-16 / Windows-1252 / ISO-8859-1 — Portuguese banks often export Windows-1252). Use `chardet`-style detection + fallback.
2. **Tabularize:** sniff delimiter (`;` `,` `\t` `|`), quote char; for spreadsheets choose the sheet with the most date-like rows.
3. **Find the header row:** skip preamble (bank name, account number, period lines). Score each of the first ~30 rows by "next N rows have consistent types".
4. **Infer columns** with a scoring heuristic per column, using both header keywords (PT/EN/ES/FR/DE dictionary: `data`, `data mov.`, `data valor`, `descrição`, `montante`, `débito`, `crédito`, `saldo`, `date`, `amount`, `description`, …) and value patterns:
   - date (try formats `dd-mm-yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd`, `dd.mm.yy`, Excel serials; choose the format with zero parse failures and plausible range),
   - amount (handle `1.234,56`, `1,234.56`, `-12,30`, `12,30-`, `€`, parentheses),
   - split debit/credit columns → single signed amount,
   - balance column (used to **validate sign**: `balance[i] = balance[i-1] + amount[i]` → if it holds with flipped sign, flip),
   - description / payee / reference / category (if the bank provides one).
5. **Preview & confirm UI:** show the detected mapping with the first 20 parsed rows, let the user fix any column, date format, sign, or target account. Highlight rows that failed to parse.
6. **Save an import profile** (§5.2) keyed by a fingerprint of (normalized header names + column count + delimiter). Next import with the same fingerprint is one click.
7. Run the ingestion pipeline (dedup → categorize → store) and show a summary: X new, Y duplicates skipped, Z need review.

Imports run on the **server** (web upload or Android share-sheet "Open with Wallt" → upload). If offline on Android, queue the file and upload later.

### 5.2 Bank import setup (in-app, no code changes)
Adding a new bank/account format must be doable **entirely from the app** (Settings → Import formats), never by editing code or committing fixtures.

- **Import profile** = named, editable record: `name` (e.g. "Millennium BCP – conta à ordem"), optional institution, default target account, fingerprint(s), decoding (encoding, delimiter, sheet), header row / rows to skip, column mapping, date format, decimal/thousand separators, sign rule (single signed column / debit+credit / invert / validate by balance), description cleanup (regex strip list), payee extraction, footer rows to ignore, optional bank-category → Wallt category mapping.
- **Setup wizard** ("Add bank format"): upload one sample export → auto-detection (§5.1 steps 1–4) pre-fills everything → live preview of the parsed rows updates as you change any setting → validation panel (rows that failed, balance check result, date range, totals in/out) → save. Nothing is written to transactions during setup.
- **Manage:** list, edit, duplicate, rename, delete, re-test against a new sample file, see which accounts/imports used it. Multiple fingerprints per profile (banks change export headers occasionally; a mismatch offers "update this profile" instead of starting over).
- **Matching on import:** fingerprint match → auto-apply; no match → offer the closest profiles by similarity or "set up new format".
- **Portability:** export/import profiles as JSON (share between installs, back up with the DB). Profiles are synced like other user data.

Repo fixtures (`fixtures/`) are only for testing the **auto-detection engine** with synthetic/anonymized files (generated PT-style variants: `;` + comma decimals, debit/credit split, preambles, Windows-1252, XLSX with merged header cells). They are not needed to support a specific bank.

---

## 6. Categorization (rules + local ML)

Order of evaluation, first confident hit wins:
1. **User rules** (`rules` table): conditions on payee/description (contains/regex), amount range, account, sign → category/tags/payee rename. Priority ordered.
2. **Exact payee memory:** if the same clean payee was categorized by the user ≥2 times with the same category → use it (confidence 0.95).
3. **Local ML classifier** (in `packages/categorize`, pure TS, runs on the server):
   - Features: hashed character 3–5-grams + word tokens of `description_clean`/payee, amount bucket (log scale), sign, account id, weekday, bank-provided category/MCC if any.
   - Model: multinomial logistic regression (or Complement Naive Bayes as baseline) trained on the user's own categorized transactions. Small enough to train in seconds on 50k rows.
   - Output: top category + calibrated probability.
   - Retrain: nightly job + after every 20 user corrections. Store models in `ml_models` with metrics (accuracy on a held-out 20%); keep the previous model and roll back if accuracy drops.
4. **Cold start:** seed keyword rules for common PT merchants (Continente, Pingo Doce, Lidl, Galp, Repsol, Via Verde, EDP, MEO/NOS/Vodafone, Uber, Bolt, Glovo, MB WAY, etc.) shipped as default editable rules.
5. **Thresholds:** confidence ≥ 0.85 → auto-assign (`method='ml'`); 0.5–0.85 → assign tentatively + `needs_review`; < 0.5 → uncategorized + `needs_review`.

**Review queue UX:** on app open, if `needs_review > 0`, show a dismissible sheet: "7 transactions need a category" → swipeable cards (Android) / keyboard-driven list (web: ↑↓ to move, 1–9 to pick a suggested category, Enter to accept). Each answer offers "Always categorize *Payee* as *Category*" → creates a rule. Every correction is training data.

Never overwrite a category the user set manually.

---

## 7. (reserved)

Section number kept so existing references stay valid.

---

## 8. Server, Docker, backups

- One image: Hono API + static web build + job scheduler. `docker-compose.yml` with a single `/data` volume containing `wallt.db`, `attachments/`, `secrets/`, `backups/` (local staging).
- SQLite: WAL mode, `foreign_keys=ON`, `busy_timeout`, migrations run on startup (with a pre-migration backup).
- Healthcheck endpoint `/health`; structured JSON logs (pino).
- Env: `APP_URL`, `ENCRYPTION_KEY`, `BACKUP_AGE_RECIPIENT`, `GDRIVE_*`, `TZ`.
- **Backups:**
  - Snapshot with SQLite online backup (`VACUUM INTO`) → tar with attachments → gzip → **encrypt with `age`** → upload to Google Drive via OAuth (user account, `drive.file` scope, refresh token stored encrypted). Service accounts are not suitable for personal Drive storage.
  - Schedule: daily 03:30 local time + before every migration. Retention: 14 daily, 8 weekly, 12 monthly (GFS), pruning on Drive.
  - `restore` CLI command: download → decrypt → verify integrity (`PRAGMA integrity_check`) → swap DB.
  - CI test: backup → restore → row counts match. Settings screen shows last backup time/status; notify on failure.
- Exposure: public at `https://wallt.example.com` through the host nginx (TLS + `limit_req` on `/auth/*`); the container is published on 127.0.0.1 only. Security relies on app auth: mandatory TOTP 2FA, login rate limiting + lockout, secure tokens, CSP and security headers sent by the app. The app trusts `X-Real-IP` only from `TRUSTED_PROXIES`. No Cloudflare Access/Tunnel/WAF (owner decision in #12). See `docs/deploy.md`. **Ask before changing what is exposed.**

---

## 9. Design system & responsive UX

Goal: one design language, but **layouts adapt** to the platform — the web is a desktop-class app.

### 9.1 Visual direction
Full rules: [`docs/design/GUIDELINES.md`](design/GUIDELINES.md) (visual reference: `docs/design/reference.html`).
- Clean, modern fintech: generous whitespace, soft surfaces, greyscale UI with one user-selectable `data` colour (charts, focus, selection; #79), large rounded numbers, subtle depth instead of heavy shadows.
- Typography: Geist + Geist Mono (self-hosted via `@expo-google-fonts`, same on both; decided in #79), tabular figures for all amounts.
- Tokens in `packages/ui/tokens.ts` → Tailwind preset: colors (semantic: `bg`, `surface`, `text`, `muted`, `accent`, `positive`, `negative`, `warning`), spacing 4-pt grid, radius (8/12/20), elevation, motion durations/easings. Light + dark from day one.
- Category colors from a curated palette with checked contrast in both themes.
- Motion: list item enter/exit, number tickers on balances, sheet/drawer springs; respect "reduce motion".
- Accessibility: WCAG AA contrast, screen-reader labels, 44 px touch targets, full keyboard support on web.

### 9.2 Responsive layout rules
| Width | Navigation | Layout |
|---|---|---|
| < 640 px (phone) | bottom tabs + FAB "add transaction" | single column, bottom sheets |
| 640–1024 px (tablet / small window) | navigation rail | 2 columns where useful |
| > 1024 px (desktop web) | collapsible sidebar | dashboard grid (12-col), list + detail side panel, modals instead of sheets |

Web-specific must-haves: hover states, right-click/context menus on rows, sortable/resizable virtualized transactions **table** (not cards), multi-select + bulk edit, keyboard shortcuts (`N` new, `/` search, `⌘K` palette, `E` edit, `Del`), drag-and-drop file import, URL state for filters (shareable/bookmarkable), proper `<title>`s, browser back works.

Implementation: `useBreakpoint()` hook + NativeWind responsive classes; screen components may have `.web.tsx` variants only when the layout truly differs (e.g. table vs list). Keep logic in hooks shared by both.

### 9.3 Key screens
Dashboard (net worth, month cashflow, budgets snapshot, recent tx, review prompt) · Transactions (list/table, filters, search) · Transaction editor · Accounts (list + detail with balance chart) · Budgets · Reports · Categories & rules · Recurring/upcoming · Goals · Debts · Import wizard · Settings (theme, currency, backups, devices, lock, export).

Deliverable of P2: a `/dev/ui` route (hidden in production) showing every component in both themes and three widths — used for visual review in PRs (attach screenshots).

---

## 10. Phases & tasks

Each task = one GitHub issue = one PR (unless noted). Acceptance criteria (AC) must be met and tested before merge. Phases are GitHub **milestones**.

### P0 — Foundations & spikes
1. Monorepo skeleton (repo already exists: `fmgoliveira/wallt`), Biome, strict tsconfig, Turborepo, pnpm. AC: `pnpm lint typecheck test build` pass on empty packages.
2. CI workflow (lint, typecheck, unit tests, build web, build server image). Branch protection on `main`.
3. Expo app shell with Expo Router, running on Android emulator and web. AC: hello screen on both.
4. **Spike:** expo-sqlite on web (WASM/OPFS, COOP/COEP headers) with Drizzle. Write ADR 0002 with the decision (local DB on web vs remote repository).
5. **Spike:** charts library — render donut, bars, line on Android + web; measure web bundle delta and FPS. ADR 0003.
6. **Spike:** NativeWind + Reanimated on web/Android, verify responsive classes and dark mode. ADR 0004.
7. ADR 0001 (stack + pinned versions). **Owner reviews ADRs before P1 starts.**

### P1 — Data & server core
1. `packages/core`: money utils (parse/format/add/convert), dates, Zod schemas. AC: 100% unit coverage of money utils.
2. `packages/db`: Drizzle schema for all tables (§3) + migrations; seed default categories.
3. Server skeleton: Hono, config, logging, `/health`, migrations on boot.
4. Auth: setup-first-user flow, login, mandatory TOTP 2FA + recovery codes, device registration, access/refresh tokens, logout device.
5. Dockerfile (multi-stage, non-root) + compose; serves web build on same origin.
6. Backups to Google Drive (encrypted, GFS retention) + restore CLI + CI restore test.

### P2 — Core app (local-only first)
1. Design tokens, fonts, theme provider, `/dev/ui` gallery; base components (Button, Input, AmountInput, Select, Sheet/Modal, Card, ListItem, Table, Tabs, Toast, EmptyState, Skeleton).
2. Responsive app shell (tabs / rail / sidebar) + navigation.
3. Local DB on device + repository layer (interface usable by remote implementation too).
4. Accounts CRUD + derived balances.
5. Categories CRUD (2 levels, icons, colors, reorder).
6. Transactions CRUD: add/edit/delete, transfers, splits, tags, notes; fast add (≤3 taps on Android).
6b. Attachments (optional per transaction): camera/file picker, thumbnails, stored in `/data/attachments`, synced as files, included in backups.
7. Transactions list (Android) + virtualized table (web) with search/filters/bulk edit.
8. Dashboard v1.
9. Lock screen (biometric/PIN, Android), privacy mode.
10. Visual design pass: apply `docs/design/GUIDELINES.md` to all P2 screens and components (#79). **Last P2 task; P3 starts after it is merged.**

### P3 — Sync
1. HLC + outbox + `packages/sync` protocol types.
2. Server `/sync/push` and `/sync/pull`.
3. Client sync loop + status indicator ("synced 2 min ago", offline badge).
4. Multi-device convergence property tests. **Owner review required (touches data integrity).**

### P4 — Budgets, recurring, goals, reports
1. Budgets (periods, scopes, rollover, alerts).
2. Recurring rules + upcoming bills; auto-detection of recurring charges (suggestions).
3. Goals, debts.
4. Reports screen: all charts in §1.3 with shared filter bar; web uses the dashboard grid.
5. Multi-currency: FX job (ECB daily), conversion in reports to base currency.
6. Notifications (local on Android; in-app on web).

### P5 — Universal import
1. Decoding + tabularization (CSV/XLS/XLSX/ODS).
2. Header detection + column inference + balance-based sign validation.
3. OFX and CAMT.053 parsers.
4. Import wizard UI (upload/drag-drop/share-sheet, mapping preview, account pick).
4b. Import formats manager (§5.2): setup wizard with live preview + validation, edit/duplicate/delete/re-test, multi-fingerprint, JSON export/import, sync.
5. Ingestion pipeline: normalize, dedup, transfer detection, batch undo.
6. Synthetic fixture generator + golden tests for the auto-detection engine (no real bank files required). Owner may optionally add anonymized real samples.

### P6 — Categorization
1. Rules engine + rules UI (create from a transaction, test against history: "this rule would match 34 transactions").
2. Payee aliases + description cleaning.
3. ML classifier: training, evaluation, persistence, nightly job, rollback.
4. Review queue (on-open sheet, swipe cards on Android, keyboard flow on web) + "always categorize as" → rule.
5. Metrics in Settings: auto-categorized %, model accuracy.

### P7 — Polish & release
1. i18n PT/EN, accessibility pass, empty states, onboarding (create accounts → import).
2. Performance: 50k-transaction dataset; list scroll 60fps; dashboard < 300 ms; web Lighthouse ≥ 90.
3. Export CSV/JSON; delete-all-data.
4. E2E: Playwright suite for web critical paths; Maestro smoke for Android.
5. Release pipeline: tagged release → Docker image on GHCR + signed APK attached to GitHub Release. Self-update notice in app.

---

## 11. GitHub repo & PR workflow

- **Repo:** private, `wallt`. Default branch `main`, protected: PR required, CI green, linear history, no force-push.
- **Issues:** one per task in §10, created from this plan with labels `type:feat` / `type:chore` / `type:spike` / `type:test`, `area:ui` / `area:server`, `owner-review` (data integrity, money, sync, auth, secrets, backups), and `question` / `blocked` / `later` when needed. Milestones = phases (P0–P7). Use a GitHub Project board (Todo / In progress / In review / Done).
- **Branches:** `<type>/<issue#>-<short-slug>` e.g. `feat/42-import-header-detection`.
- **Commits:** Conventional Commits (`feat(import): detect header row`). release-please generates the changelog and versions.
- **PR size:** one task per PR, aim < 400 changed lines (excluding fixtures/lockfiles/generated). Split otherwise.
- **PR template** (`.github/pull_request_template.md`):
  ```
  Closes #<issue>
  ## What & why
  ## How (key decisions; link ADR if any)
  ## Screenshots (Android + web, light + dark) — for UI changes
  ## Tests (what was added, how to run)
  ## Risks / migration / data impact
  ## Open questions (if any — do not merge until answered)
  - [ ] Lint, typecheck, tests pass locally
  - [ ] No secrets, no real personal/bank data
  - [ ] Docs/ADR updated if behavior or architecture changed
  ```
- **Merge:** squash merge after CI is green. The **owner reviews and merges**; an agent never merges its own PR unless the owner explicitly allows it for that PR.
- **Definition of done:** AC met · tests added (unit for pure packages, e2e for critical flows) · works on Android **and** web at all three breakpoints (UI tasks) · no new warnings · docs updated.
- **CI jobs:** lint → typecheck → unit tests → web build → server image build → (on `main`) backup/restore test → (on tag) release.
- **Secrets:** GitHub Actions secrets only; `.env.example` documents every variable; `gitleaks` in CI.
- **Data hygiene:** never commit real bank exports, account numbers, or personal transactions. Fixtures must be anonymized (fake names, shifted amounts, masked IBANs).

---

## 12. Risks & mitigations
| Risk | Mitigation |
|---|---|
| expo-sqlite on web immature | P0 spike; remote-repository fallback behind the same interface |
| Web feels like a phone app | Breakpoint rules in §9.2, `.web.tsx` variants for tables, review screenshots at 3 widths in every UI PR |
| Sync bugs corrupt data | Server as source of truth, tombstones, property tests, backups before migrations, owner review on sync PRs |
| Duplicates from overlapping imports | external_id + dedup_hash + occurrence index; ambiguous → review, never silent drop; batch undo |
| ML miscategorizes | Confidence thresholds, review queue, user category always wins, model rollback |
| Losing data | Daily encrypted off-site backups, tested restore in CI, failure notifications |

---

## 13. Open questions for the owner (answer before the related phase)
1. ~~App name~~ → **Wallt** (decided).
2. ~~Banks~~ → ActivoBank + Trade Republic initially; configurable in-app (decided, #58).
3. ~~Exposure~~ → public `wallt.example.com` behind host nginx + app auth with 2FA (#55; Cloudflare Tunnel dropped by owner in #12).
4. ~~Second user~~ → possibly later; scope everything by `user_id` (decided, #56).
5. ~~Attachments~~ → v1, optional (decided, #57).

---

## Appendix A — `AGENTS.md` (copy to repo root)

```md
# Agent instructions

1. Read docs/PLAN.md and the relevant ADRs before starting any task.
2. Work on exactly one GitHub issue at a time. Create a branch `<type>/<issue#>-<slug>`.
3. **In case of doubt, ask first.** Open/comment on the issue with label `question`, list options and your
   recommendation, and wait. Never guess on: schema/sync changes, money math, dedup, auth, secrets, backups,
   bank APIs, new heavy dependencies, scope changes, or weakening tests/CI.
4. Keep PRs small (< 400 changed lines excl. generated/fixtures). Fill in the PR template completely.
5. Pure packages (core, ingest, categorize, sync) must stay free of React and IO and have unit tests.
6. Money = integer minor units via packages/core/money.ts. Never use floats for amounts.
7. UI changes: verify Android + web at phone/tablet/desktop widths, light + dark; attach screenshots.
8. Never commit secrets or real financial data. Fixtures must be anonymized.
9. Run `pnpm lint && pnpm typecheck && pnpm test` before pushing. Do not merge your own PR unless the
   owner explicitly says so.
10. If the plan and the code disagree, stop and ask which one is right.
```
