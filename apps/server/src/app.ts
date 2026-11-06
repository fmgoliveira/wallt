import type { BlockList } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import { SCHEMA_VERSION } from "@wallt/db";
import { Hono } from "hono";
import type { Db } from "./database";
import type { Logger } from "./logger";
import { parseTrustedProxies, resolveClientIp } from "./proxy";
import { securityHeaders } from "./security";
import { inlineScriptHashes, serveWeb } from "./web";

export type AppDeps = {
  db: Db;
  log: Logger;
  /** Directory with the static Expo web export; when omitted only the API is served. */
  webDir?: string;
  /** Reverse proxies whose X-Real-IP is trusted (default: loopback only). */
  trustedProxies?: BlockList;
};

export type AppEnv = { Variables: { clientIp: string } };

export function createApp({ db, log, webDir, trustedProxies }: AppDeps) {
  const app = new Hono<AppEnv>();
  const trusted = trustedProxies ?? parseTrustedProxies("127.0.0.1,::1");

  app.use(securityHeaders(webDir ? inlineScriptHashes(webDir) : []));

  app.use(async (c, next) => {
    let peer: string | undefined;
    try {
      peer = getConnInfo(c).remote.address;
    } catch {
      peer = undefined; // no socket (e.g. app.request in tests)
    }
    c.set("clientIp", resolveClientIp(peer, c.req.header("x-real-ip"), trusted));
    await next();
  });

  // Logs method/path/status only (never the query string, which could carry tokens).
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ip: c.get("clientIp"),
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

  if (webDir) app.use(serveWeb(webDir));

  return app;
}
