import type { Keys } from "../auth/crypto";
import type { Config } from "../config";
import type { Db } from "../database";
import type { Logger } from "../logger";
import type { createScheduler } from "../scheduler";
import { createDriveStorage, createSecretStore, type FetchLike } from "./google";
import { createBackupService } from "./service";

export const BACKUP_SCHEDULE = "30 3 * * *"; // daily 03:30 in the server's TZ

/**
 * Wires encrypted Drive backups when `BACKUP_AGE_RECIPIENT` and the Google client are configured;
 * returns null (and says why) otherwise. Registers the daily job on the scheduler.
 */
export function configureBackups(opts: {
  config: Config;
  db: Db;
  log: Logger;
  keys: Keys;
  scheduler: ReturnType<typeof createScheduler>;
  /** Injectable for tests. */
  fetch?: FetchLike;
}) {
  const { config, db, log, keys, scheduler } = opts;
  const {
    BACKUP_AGE_RECIPIENT: recipient,
    GDRIVE_CLIENT_ID: clientId,
    GDRIVE_CLIENT_SECRET: clientSecret,
  } = config;
  if (!recipient || !clientId || !clientSecret) {
    const missing = [
      !recipient && "BACKUP_AGE_RECIPIENT",
      !clientId && "GDRIVE_CLIENT_ID",
      !clientSecret && "GDRIVE_CLIENT_SECRET",
    ].filter(Boolean);
    log.warn({ missing }, "backups are DISABLED: set the missing variables (see docs/deploy.md)");
    return null;
  }
  const secrets = createSecretStore(config.DATA_DIR, keys.encKey);
  if (!secrets.read()) {
    log.warn(
      "Google Drive is not linked yet: run `node drive-auth.mjs` (backups will fail until then)",
    );
  }
  const service = createBackupService({
    db,
    dataDir: config.DATA_DIR,
    log,
    recipient,
    storage: createDriveStorage({
      google: { clientId, clientSecret },
      secrets,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    }),
  });
  scheduler.register({
    name: "backup",
    schedule: BACKUP_SCHEDULE,
    run: async () => {
      const r = await service.run("scheduled");
      if (r.status === "failed") throw new Error(r.error); // recorded as a failed job_run too
      return r.status === "success" ? { sizeBytes: r.sizeBytes, pruned: r.pruned } : undefined;
    },
  });
  return service;
}
