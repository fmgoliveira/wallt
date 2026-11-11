# Wallt

Self-hosted personal finance & budget tracker — a Cashew-like app with multiple accounts, transactions, budgets, categories, reports and universal statement import.

- **Clients:** one Expo (React Native) codebase → Android app + responsive web app, same design.
- **Server:** Docker container, SQLite file DB, encrypted automated backups to Google Drive.
- **Smart:** rules + local ML categorization; anything uncertain goes to a review queue.

## Docs
- [Implementation plan](docs/PLAN.md)
- [Agent / contributor rules](AGENTS.md)
- Architecture decisions: `docs/adr/`

## Workflow
Work is tracked as GitHub issues grouped by milestone (P0 → P7). One issue = one branch = one PR. See §11 of the plan.

> **In case of doubt, ask first** — open or comment on the issue with the `question` label before writing code.

## Development
Requires Node 26 (see `.nvmrc`) and pnpm 12 (`corepack enable` picks up the pinned version).

```bash
pnpm install
pnpm lint        # Biome
pnpm typecheck   # tsc via Turborepo
pnpm test        # Vitest via Turborepo
pnpm build
pnpm format      # Biome auto-fix
```

Layout: `apps/{app,server}`, `packages/{core,db,sync,ingest,categorize,ui,config}` (see `docs/PLAN.md` §2.2).
Shared TS/Biome config lives in `packages/config`. Copy `.env.example` to `.env` for local settings.

## End-to-end tests
- **Web (Playwright, runs in CI):** `pnpm --filter @wallt/app build`, then `pnpm e2e` (first time: `pnpm --filter @wallt/e2e exec playwright install chromium`). The tests start the server serving the web export on port 3100 with a throw-away data directory; see `apps/e2e`.
- **Android (Maestro, by hand):** install the app on an emulator or device, then `maestro test apps/e2e/maestro/smoke.yaml`.
