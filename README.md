# Wallt

Self-hosted personal finance & budget tracker — a Cashew-like app with multiple accounts, transactions, budgets, categories, reports, automatic bank sync (PSD2) and universal statement import.

- **Clients:** one Expo (React Native) codebase → Android app + responsive web app, same design.
- **Server:** Docker container, SQLite file DB, encrypted automated backups to Google Drive.
- **Smart:** rules + local ML categorization; anything uncertain goes to a review queue.

## Docs
- [Implementation plan](docs/PLAN.md)
- [Agent / contributor rules](AGENTS.md)
- Architecture decisions: `docs/adr/`

## Workflow
Work is tracked as GitHub issues grouped by milestone (P0 → P8). One issue = one branch = one PR. See §11 of the plan.

> **In case of doubt, ask first** — open or comment on the issue with the `question` label before writing code.
