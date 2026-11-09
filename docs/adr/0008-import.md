# ADR 0008 — Universal import (P5)

- Status: **Proposed** — owner review required (dedup and the ingestion pipeline, PLAN §5 / §10 P5.5)
- Plan: §5, §5.1, §5.2 · Builds on ADR 0005 (repository) and ADR 0007 (sync)

## Context
PLAN §5 describes a pipeline shared by file import and (later) bank sync, and says imports run on the server. P5 builds
the file side: decoding, tabularization, detection, OFX/CAMT, dedup, the wizard and the saved-format manager. This ADR
records where the plan left room and where the implementation deliberately differs.

## Decisions
1. **Pure `packages/ingest`, executed on the device.** Decode, detect, parse, clean, dedup and transfer detection are pure
   functions (bytes in, rows or a plan out; no React, no IO, no TextDecoder/crypto globals so they run on Hermes). The
   wizard parses locally for the live preview and commits through the existing repository, which already syncs. **There is no
   `/import` endpoint yet** (the plan's server upload): it would add auth/endpoint surface and need the server online, while
   the local path works offline and reuses sync. Bank sync (P7) will call the same pipeline from the server.
2. **SheetJS from the vendor tarball** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) for XLS/XLSX/ODS. The npm
   `xlsx` package is stale and carries known advisories; the vendor build is the maintained one. Spreadsheet cells become
   text (dates as ISO `YYYY-MM-DD`, numbers as displayed) so CSV and workbooks share one detection path.
3. **Detection order** (`mapping.ts`): header row by scoring text-then-data rows (keywords PT/EN/ES/FR/DE, Excel serial
   dates), column roles from header keywords first and value patterns second, date format (day-first preferred over
   month-first when both fit), decimal separator per column, debit/credit merge, and **balance reconciliation**
   (`balance[i] = balance[i-1] + amount[i]`, either order) to flip the sign and spot newest-first files. Delimiter sniffing
   counts *untrimmed* columns, otherwise sparse debit/credit rows make decimal commas look like a delimiter.
4. **Dedup** (`pipeline.ts`, owner review): external id first, then
   `sha256(account | booking_date | amount | normalized_description | occurrence_index)`; the normalization for the hash is
   deliberately simpler than display cleaning so improving cleaning never changes stored hashes. Pending -> booked: one
   pending row with the same amount within ±5 days and similar text is *updated*; several candidates, or an untracked
   hand-entered row with the same amount within a day, are inserted **flagged `needs_review`** with the reason in `notes`.
   Nothing is ever silently dropped except exact duplicates.
5. **Transfers**: opposite amounts on two own accounts within 3 days. Auto-link only when unique on both sides and
   confidence >= 0.9 (hint word, same day); everything else stays a suggestion. `linkTransfer` is a repository method.
6. **Batch = `import_batch_id`, no new table.** The plan mentions an `import_batch`; the schema only has the column, and
   adding a synced table is a schema/sync change. Undo is `deleteImportBatch(batchId)`: soft-deletes the batch's
   transactions and, for a batch row linked to a transaction outside the batch, unlinks the peer first so the other
   account keeps its row. Pending rows that were *updated* (not inserted) by an import are not reverted by undo.
7. **Import profiles** are rows of the existing synced `import_profiles` table (`repository.importProfiles`);
   `config` is `{ version: 1, mapping, encoding?, delimiter?, sheet? }`. The fingerprint is a hash of normalized header
   names + column count + delimiter. A profile can hold several fingerprints; re-testing with a changed export adds one.
   Portability is JSON (`wallt-import-profiles`, version 1) with validation and name de-duplication.
8. **Not done in P5**: Android share-sheet "Open with Wallt" (needs native intent filters and a device to verify), offline
   upload queue (nothing is uploaded), `payee_aliases` management (P6; the pipeline already accepts aliases), per-account
   usage history of a profile (only the default account is stored).

## Consequences
- Imports work offline and sync like any write; a wrong import is one tap to undo.
- Detection quality is covered by seeded golden tests over 12 synthetic layouts (`fixtures/`, no real bank data); a bank
  that is still misread is fixed in the app (adjust columns, save the format), not in code.
- Large files are parsed on the UI thread (bank exports are kilobytes; a 20 MB guard rejects wrong files). Revisit with
  a worker if 50k-row imports show jank (P8 performance).
