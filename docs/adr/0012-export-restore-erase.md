# 0012 — Export, restore and delete-all (P7.3)

## Context
Plan §1.3 / #52: full export (CSV per entity + JSON bundle) and a guarded "delete all data" with a fresh backup first. Owner decisions: delete covers the server and this device; the JSON bundle can be restored (so export → import is a real round trip).

## Decision
- **Generic over the synced tables** (`packages/db/src/data-port.ts`), exactly as sync works, so no entity can be forgotten. `repo.data` offers `exportBundle`, `importBundle`, `eraseAll`.
- **JSON bundle:** `{ kind: "wallt-export", version: 1, schemaVersion, exportedAt, tables }` with every live row as stored (integer minor units). A bundle from a newer schema is refused; a table missing from an older bundle is treated as empty.
- **CSV:** one table at a time (pick from a list), UTF-8 with BOM, quoted cells, sync plumbing columns (`user_id`, `hlc`, `server_seq`, `deleted_at`) left out. Amounts stay integer cents.
- **Restore:** only into an empty ledger (no live accounts or transactions), in one SQL transaction (all or nothing). Rows keep their ids, become the importing user's, and queue for sync through the normal outbox triggers. The device's own default categories are merged with the restored ones by the existing `dedupeSystemCategories`.
- **Delete all:** typed confirmation ("DELETE"/"ELIMINAR"). When signed in, the app first asks the server for a fresh backup (`POST /backups/run`); a failed backup aborts the deletion, "backups not configured" continues with a notice. Then every live row on the device is soft-deleted (tombstones) and the sync pushes them, so the server and other devices clear on their next sync. The built-in default categories stay so the emptied ledger is usable.
- **Files:** a download on web, the share sheet on Android (`expo-file-system` + `expo-sharing`, new small Expo dependencies).

## Consequences / open points
- Tombstones on the server still carry the deleted rows' content until a purge exists, and Drive backups keep older data. A server-side purge of tombstoned rows is only safe once every device has pulled them, so it needs a decision (e.g. per-device pull cursors) and was **not** built. Until then "delete" is a logical delete on the server.
- Restore into a non-empty ledger and merge-style import are not supported.
- Android share-sheet export and the file pickers were not exercised on a device.
