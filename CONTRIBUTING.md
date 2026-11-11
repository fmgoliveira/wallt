# Contributing to Wallt

Thanks for your interest! Wallt is a self-hosted personal finance tracker; contributions of all sizes are welcome.

> **In case of doubt, ask first.** Open an issue (or comment on an existing one) before writing code for anything
> non-trivial, so nobody wastes time on a direction that will not be merged.

## Ground rules

The full rules live in [`AGENTS.md`](AGENTS.md) (they apply to humans and AI agents alike); the design is in
[`docs/PLAN.md`](docs/PLAN.md) and [`docs/adr/`](docs/adr/). The short version:

- One issue = one branch = one pull request. Keep PRs small (< 400 changed lines, excluding generated files and fixtures).
- Ask before changing: schema/sync protocol, money math, dedup, auth, secrets, backups, or adding heavy dependencies.
- Money is always integer minor units via `packages/core`; never floats.
- Pure packages (`core`, `ingest`, `categorize`, `sync`) stay free of React and IO and need unit tests.
- **Never commit secrets or real financial data.** Fixtures must be synthetic.
- UI changes: check Android and web at phone/tablet/desktop widths, light and dark, and attach screenshots.

## Setup

Requires Node 26 (`.nvmrc`) and pnpm (`corepack enable` picks the pinned version).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # must pass before you push
```

See the [README](README.md) for e2e tests and running the app.

## Commits and PRs

- Branch names: `<type>/<issue#>-<slug>`, e.g. `feat/42-csv-import`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `feat!:` for breaking
  changes): releases and the changelog are generated from them by release-please.
- Fill in the pull request template completely.

## Licensing

Wallt is licensed under [AGPL-3.0](LICENSE). By submitting a contribution you agree it is licensed under the same terms.
Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
