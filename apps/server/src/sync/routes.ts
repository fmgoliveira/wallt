import { pushRequestSchema, SYNC_PULL_LIMIT } from "@wallt/sync";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type AuthEnv, requireAuth } from "../auth/routes";
import type { AuthService } from "../auth/service";
import type { Db } from "../database";
import type { FileStore } from "../files/store";
import { purgeDeletedRows } from "./purge";
import type { SyncService } from "./service";

/** `/sync/push` and `/sync/pull` (access token required). See ADR 0007. */
export function syncRoutes(
  auth: AuthService,
  sync: SyncService,
  db: Db,
  now: () => number,
  files?: FileStore,
) {
  const app = new Hono<AuthEnv>();
  app.use(requireAuth(auth));
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  const touch = db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?");
  // `since` is what the device has already applied: remember the highest, the purge of deleted rows waits on it.
  const recordPulled = db.prepare(
    "UPDATE devices SET last_pull_seq = MAX(COALESCE(last_pull_seq, 0), ?) WHERE id = ?",
  );

  const schemaConflict = (error: "schema_outdated" | "server_outdated") => ({
    error,
    serverSchemaVersion: sync.serverSchemaVersion,
  });

  app.post(
    "/push",
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const parsed = pushRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
      const check = sync.checkSchema(parsed.data.schemaVersion);
      if (!check.ok) return c.json(schemaConflict(check.error), 409);
      const result = sync.push(c.get("userId"), parsed.data);
      touch.run(new Date(now()).toISOString(), c.get("deviceId"));
      return c.json(result);
    },
  );

  app.get("/pull", (c) => {
    const since = Number(c.req.query("since") ?? "0");
    const limit = Number(c.req.query("limit") ?? SYNC_PULL_LIMIT);
    const schemaVersion = Number(c.req.query("schemaVersion"));
    if (!Number.isSafeInteger(since) || since < 0 || !Number.isSafeInteger(limit) || limit < 1) {
      return c.json({ error: "invalid_request" }, 400);
    }
    if (!Number.isSafeInteger(schemaVersion)) return c.json({ error: "invalid_request" }, 400);
    const check = sync.checkSchema(schemaVersion);
    if (!check.ok) return c.json(schemaConflict(check.error), 409);
    const result = sync.pull(c.get("userId"), since, limit);
    touch.run(new Date(now()).toISOString(), c.get("deviceId"));
    recordPulled.run(since, c.get("deviceId"));
    return c.json(result);
  });

  // Removes this user's deleted rows from the server once every active device has applied them (see purge.ts).
  app.post("/purge", (c) => c.json(purgeDeletedRows(db, c.get("userId"), now(), files)));

  return app;
}
