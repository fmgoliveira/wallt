# 0013 — Attachments: receipt photos and PDFs (P2.6b)

- Status: **Accepted** (owner, 2026-11-11: design, schema change and the two new Expo packages approved before work started)
- Issue: #65 · Plan: §1.3, P2.6b · Builds on ADR 0007 (sync), ADR 0012 (purge)

## Context
A transaction can carry optional receipts. ADR 0007 syncs `attachments` *rows* only and left the bytes open. The files must reach other devices, survive backups, and disappear from the server when the transaction is deleted.

## Decision
**Rows sync as before, bytes travel on a separate channel.**

- **Schema (migration 0004, schema version 5):** `attachments` gains `name` (original file name), `size` (bytes) and `sha256` (hex). `mime` is restricted to JPEG, PNG, WebP and PDF; `filePath` becomes `<id>.<ext>`, the same on every device. The row is the source of truth for what the file must be.
- **Server (`apps/server/src/files`):** `PUT /files/:id` and `GET /files/:id` (access token). A `PUT` is accepted only if the row already exists for that user and the body matches its `size` and `sha256` (else 422), so the server never stores bytes the owner's own metadata does not describe. Files live at `<DATA_DIR>/attachments/<userId>/<id>`, written through a temp file + rename. Downloads are `Content-Disposition: attachment` with `nosniff`. Upload limit 20 MB (hard cap; the row schema enforces the same).
- **Backups:** the existing archive already packs `attachments/` (no change); restore already puts it back.
- **Deleting:** deleting an attachment or a transaction soft-deletes the rows (tombstones, synced as usual). The server removes the files when it purges those tombstones (ADR 0012: after every active device applied them), after the transaction commits.
- **Client:**
  - Bytes are stored per device in `OPFS/attachments` on web and `documentDirectory/attachments` on Android, keyed by `filePath`.
  - Adding: pick (camera / photo library / file) → photos are resized to 2000 px on the long side and re-encoded as JPEG at quality 0.7 (`expo-image-manipulator`, canvas on web) → size limit check (default 10 MB, 2/5/10/20 MB in Settings → Your data, a device setting) → row + bytes written → file queued in `sync_meta` (`attachment_uploads`).
  - Upload: after each completed sync the queue is flushed; a 404 (row not pushed yet) or network error leaves it queued, a 422 drops it.
  - Download: on demand when somebody opens a file, plus images when the editor opens (for thumbnails). The download is verified against `size` and `sha256` and discarded if it differs.
  - Changes are held in the editor and written on Save; Cancel changes nothing.
- **New dependencies (approved):** `expo-image-picker`, `expo-image-manipulator`. SHA-256 over bytes is the existing pure implementation in `@wallt/ingest` (extended from strings to bytes).

## Consequences / open points
- The JSON export (ADR 0012) contains attachment *rows* but not the files; they are in the server backup. "Delete all data" removes this device's files and, through tombstones + purge, the server's.
- A file added on a device that never syncs stays only on that device. Files deleted by another device linger on this one until the app data is cleared (no local garbage collection yet).
- Transfers (the two legs of a transfer) do not take receipts; attach them to a normal transaction.
- Not covered by automated UI tests: camera and picker flows need a device. Server, repository, queue and download logic have unit tests.
