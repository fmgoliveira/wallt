import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase, runMigrations } from "./database";
import { createLogger } from "./logger";
import { createScheduler } from "./scheduler";

const config = loadConfig();
const log = createLogger(config);
const db = openDatabase(config.DATA_DIR);
await runMigrations(db, config.DATA_DIR, log);

const scheduler = createScheduler(db, log);
const server = serve({ fetch: createApp({ db, log }).fetch, port: config.PORT }, (info) => {
  log.info({ port: info.port, dataDir: config.DATA_DIR }, "server listening");
});

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
