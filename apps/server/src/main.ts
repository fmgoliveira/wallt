import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { deriveKeys } from "./auth/crypto";
import { createAuthService } from "./auth/service";
import { configureBackups } from "./backup/setup";
import { loadConfig } from "./config";
import { openDatabase, runMigrations } from "./database";
import { createFxService } from "./fx/service";
import { createLogger } from "./logger";
import { createMlService } from "./ml/service";
import { parseTrustedProxies } from "./proxy";
import { createScheduler } from "./scheduler";
import { purgeAllUsers } from "./sync/purge";

const config = loadConfig();
const log = createLogger(config);
const db = openDatabase(config.DATA_DIR);
const preMigration: { snapshot?: string } = {};
await runMigrations(db, config.DATA_DIR, log, (file) => {
  preMigration.snapshot = file;
});

const keys = deriveKeys(config.ENCRYPTION_KEY);
const auth = createAuthService({
  db,
  log,
  keys,
  setupToken: config.SETUP_TOKEN,
});
if (!config.SETUP_TOKEN) {
  log.info("SETUP_TOKEN not set: first-user setup is disabled (ignored once a user exists)");
}

const scheduler = createScheduler(db, log);
const fx = createFxService({
  db,
  log,
  fetch: (url) => fetch(url, { signal: AbortSignal.timeout(30_000) }),
});
fx.register(scheduler);
const ml = createMlService({ db, log });
ml.register(scheduler);
scheduler.register({
  name: "purge-deleted",
  schedule: "15 4 * * *",
  run: async () => ({ purged: purgeAllUsers(db, Date.now()) }),
});
const backup = configureBackups({ config, db, log, keys, scheduler });
const server = serve(
  {
    fetch: createApp({
      db,
      log,
      auth,
      backup,
      fx,
      ml,
      ...(config.WEB_DIR ? { webDir: config.WEB_DIR } : {}),
      ...(config.APP_VERSION ? { version: config.APP_VERSION } : {}),
      trustedProxies: parseTrustedProxies(config.TRUSTED_PROXIES),
    }).fetch,
    port: config.PORT,
  },
  (info) => {
    log.info({ port: info.port, dataDir: config.DATA_DIR }, "server listening");
  },
);

// Best effort: a Drive outage must never stop the server from starting.
if (preMigration.snapshot && backup) {
  void backup.run("pre_migration", { dbFile: preMigration.snapshot });
}

function shutdown(signal: string): void {
  log.info({ signal }, "shutting down");
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
