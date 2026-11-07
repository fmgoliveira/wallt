import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { deriveKeys } from "./auth/crypto";
import { createAuthService } from "./auth/service";
import { loadConfig } from "./config";
import { openDatabase, runMigrations } from "./database";
import { createLogger } from "./logger";
import { parseTrustedProxies } from "./proxy";
import { createScheduler } from "./scheduler";

const config = loadConfig();
const log = createLogger(config);
const db = openDatabase(config.DATA_DIR);
await runMigrations(db, config.DATA_DIR, log);

const auth = createAuthService({
  db,
  log,
  keys: deriveKeys(config.ENCRYPTION_KEY),
  setupToken: config.SETUP_TOKEN,
});
if (!config.SETUP_TOKEN) {
  log.info("SETUP_TOKEN not set: first-user setup is disabled (ignored once a user exists)");
}

const scheduler = createScheduler(db, log);
const server = serve(
  {
    fetch: createApp({
      db,
      log,
      auth,
      ...(config.WEB_DIR ? { webDir: config.WEB_DIR } : {}),
      trustedProxies: parseTrustedProxies(config.TRUSTED_PROXIES),
    }).fetch,
    port: config.PORT,
  },
  (info) => {
    log.info({ port: info.port, dataDir: config.DATA_DIR }, "server listening");
  },
);

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
