import type { BlockList } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import { SCHEMA_VERSION } from "@wallt/db";
import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import type { AuthService } from "./auth/service";
import { backupRoutes } from "./backup/routes";
import type { BackupService } from "./backup/service";
import type { Db } from "./database";
import { fxRoutes } from "./fx/routes";
import type { FxService } from "./fx/service";
import type { Logger } from "./logger";
import { mlRoutes } from "./ml/routes";
import type { MlService } from "./ml/service";
import { parseTrustedProxies, resolveClientIp } from "./proxy";
import { securityHeaders } from "./security";
import { syncRoutes } from "./sync/routes";
import { createSyncService } from "./sync/service";
import { inlineScriptHashes, serveWeb } from "./web";

export type AppDeps = {
  db: Db;
  log: Logger;
  /** Directory with the static Expo web export; when omitted only the API is served. */
  webDir?: string;
  /** Reverse proxies whose X-Real-IP is trusted (default: loopback only). */
  trustedProxies?: BlockList;
  /** Mounts `/auth/*` when provided. */
  auth?: AuthService;
  /** `/backups` status + manual run (needs `auth`); null = backups not configured. */
  backup?: BackupService | null;
  /** `GET /fx/rates` (needs `auth`); omitted = no FX endpoint. */
  fx?: FxService;
  /** `/ml/*` classifier model + status (needs `auth`); omitted = no ML endpoints. */
  ml?: MlService;
  /** Clock (ms) for the per-IP rate limiters; tests inject one. */
  clock?: () => number;
  /** Release version of this build (`/health` reports it so apps can tell when they are out of date). */
  version?: string;
};

export type AppEnv = { Variables: { clientIp: string } };

export function createApp({
  db,
  log,
  webDir,
  trustedProxies,
  auth,
  backup,
  fx,
  ml,
  clock,
  version,
}: AppDeps) {
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
      return c.json({
        status: "ok",
        schemaVersion: SCHEMA_VERSION,
        ...(version ? { version } : {}),
      });
    } catch (err) {
      log.error({ err }, "health check failed");
      return c.json({ status: "error" }, 503);
    }
  });

  if (auth) {
    app.route("/auth", authRoutes(auth, clock));
    app.route("/sync", syncRoutes(auth, createSyncService(db, clock), db, clock ?? Date.now));
    if (backup !== undefined) app.route("/backups", backupRoutes(auth, backup));
    if (fx) app.route("/fx", fxRoutes(auth, fx, clock ?? Date.now));
    if (ml) app.route("/ml", mlRoutes(auth, ml));
  }

  app.onError((err, c) => {
    log.error({ err, path: c.req.path }, "unhandled error");
    return c.json({ error: "internal_error" }, 500);
  });

  if (webDir) app.use(serveWeb(webDir));

  return app;
}
