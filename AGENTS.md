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
