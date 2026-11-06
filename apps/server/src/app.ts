import { SCHEMA_VERSION } from "@wallt/db";
import { Hono } from "hono";
import type { Db } from "./database";
import type { Logger } from "./logger";

export type AppDeps = { db: Db; log: Logger };

export function createApp({ db, log }: AppDeps) {
  const app = new Hono();

  // Logs method/path/status only (never the query string, which could carry tokens).
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - start),
      },
      "request",
    );
  });

  app.get("/health", (c) => {
    try {
      db.prepare("SELECT 1").get();
      return c.json({ status: "ok", schemaVersion: SCHEMA_VERSION });
    } catch (err) {
      log.error({ err }, "health check failed");
      return c.json({ status: "error" }, 503);
    }
  });

  app.onError((err, c) => {
    log.error({ err, path: c.req.path }, "unhandled error");
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
