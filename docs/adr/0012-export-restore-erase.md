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

## Server purge (added after owner approval)
Soft-deleted rows would otherwise stay on the server with their content. `POST /sync/purge` (and a nightly job at 04:15) removes a user's tombstones from the server once **every active device has applied them**:
- Each device reports its pull cursor on `GET /sync/pull?since=` (`devices.last_pull_seq`, migration 0003). A tombstone with `server_seq` at or below the lowest cursor of the active devices is deleted; the rest wait.
- Why not purge immediately: a device that still holds the live row would push it back and the deletion would be undone.
- Revoked devices and devices unseen for 90 days do not hold it back. If such a device comes back with old rows it can re-push them (documented risk of the 90-day rule).
- After delete-all the app syncs twice (send the deletions, then confirm it applied them) and purges; if other devices lag, a notice names them. Settings > Your data has a "Remove deleted data from the server" button for later.
- Older Drive backups still contain the data until they rotate out or you delete them.

## Consequences / open points
- Restore into a non-empty ledger and merge-style import are not supported.
- Schema version 4 (the `transactions(booking_date)` index and `devices.last_pull_seq`): the server and the apps must be updated together, as for any schema bump (an older app gets "update the app", an older server "server needs an update").
- Android share-sheet export and the file pickers were not exercised on a device.
