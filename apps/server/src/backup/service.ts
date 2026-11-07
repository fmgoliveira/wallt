import { join } from "node:path";
import type { Db } from "../database";
import { uuidv7 } from "../ids";
import type { Logger } from "../logger";
import { buildEncryptedArchive, makeTempDir, removeDir, snapshotDatabase } from "./archive";
import {
  type BackupTrigger,
  backupFileName,
  DEFAULT_RETENTION,
  type Retention,
  selectPrune,
} from "./retention";
import type { BackupStorage } from "./storage";

export type BackupDeps = {
  db: Db;
  dataDir: string;
  log: Logger;
  /** age public key (`age1...`); backups are disabled without one. */
  recipient: string;
  storage: BackupStorage;
  retention?: Retention;
  now?: () => number;
};

export type BackupResult =
  | { status: "success"; runId: string; fileId: string; sizeBytes: number; pruned: number }
  | { status: "failed"; runId: string; error: string }
  | { status: "busy" };

export type BackupRun = {
  id: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  sizeBytes: number | null;
  error: string | null;
};

const MAX_ERROR = 500;

export function createBackupService({
  db,
  dataDir,
  log,
  recipient,
  storage,
  retention = DEFAULT_RETENTION,
  now = Date.now,
}: BackupDeps) {
  let running = false;

  /**
   * Snapshot (or use `dbFile`, e.g. the pre-migration copy) -> tar.gz -> age -> upload -> prune.
   * Never throws: failures are logged, recorded in `backup_runs` and returned. Pruning only happens
   * after a successful upload, so a failed run can never shrink the set of backups.
   */
  async function run(
    trigger: BackupTrigger,
    opts: { dbFile?: string } = {},
  ): Promise<BackupResult> {
    if (running) return { status: "busy" };
    running = true;
    const runId = uuidv7(now());
    const startedAt = new Date(now());
    // The run is recorded only when it ends, so a snapshot never contains its own in-progress row.
    const record = (
      status: "success" | "failed",
      extra: { sizeBytes?: number; fileId?: string; error?: string },
    ) =>
      db
        .prepare(
          "INSERT INTO backup_runs (id, trigger, started_at, finished_at, status, size_bytes, drive_file_id, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          runId,
          trigger,
          startedAt.toISOString(),
          new Date(now()).toISOString(),
          status,
          extra.sizeBytes ?? null,
          extra.fileId ?? null,
          extra.error ?? null,
        );
    const tmp = makeTempDir(dataDir);
    try {
      let dbFile = opts.dbFile;
      if (!dbFile) {
        dbFile = join(tmp, "snapshot.db");
        snapshotDatabase(db, dbFile);
      }
      const { bytes } = await buildEncryptedArchive({ dbFile, dataDir, recipient, now: startedAt });
      const { id: fileId } = await storage.upload(backupFileName(trigger, startedAt), bytes);
      let pruned = 0;
      try {
        for (const f of selectPrune(await storage.list(), new Date(now()), retention)) {
          await storage.delete(f.id);
          pruned++;
        }
      } catch (err) {
        log.warn({ err }, "backup uploaded but pruning failed"); // the backup itself succeeded
      }
      record("success", { sizeBytes: bytes.length, fileId });
      log.info({ trigger, fileId, sizeBytes: bytes.length, pruned }, "backup completed");
      return { status: "success", runId, fileId, sizeBytes: bytes.length, pruned };
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR);
      record("failed", { error });
      log.error({ err, trigger }, "backup failed");
      return { status: "failed", runId, error };
    } finally {
      removeDir(tmp);
      running = false;
    }
  }

  /** Recent runs, newest first, for the Settings screen. */
  function recentRuns(limit = 20): BackupRun[] {
    return (
      db
        .prepare(
          "SELECT id, trigger, started_at, finished_at, status, size_bytes, error FROM backup_runs ORDER BY started_at DESC, id DESC LIMIT ?",
        )
        .all(limit) as {
        id: string;
        trigger: string;
        started_at: string;
        finished_at: string | null;
        status: string;
        size_bytes: number | null;
        error: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      trigger: r.trigger,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      sizeBytes: r.size_bytes,
      error: r.error,
    }));
  }

  return { run, recentRuns };
}

export type BackupService = ReturnType<typeof createBackupService>;
