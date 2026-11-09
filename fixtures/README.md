# Fixtures

Synthetic bank exports (invented merchants, fake accounts, seeded generator): one file per layout the import
engine must auto-detect. **Never commit real bank data here.**

Regenerate with `WALLT_WRITE_FIXTURES=1 pnpm --filter @wallt/ingest test` (generator: `packages/ingest/src/fixtures.ts`).
Use them to try the import wizard by hand; the golden tests build the same files in memory.
