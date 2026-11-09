import { Hono } from "hono";
import { type AuthEnv, requireAuth } from "../auth/routes";
import type { AuthService } from "../auth/service";
import type { MlService } from "./service";

/**
 * `/ml/*` (access token required): the active model for devices to score with, its metrics for Settings, and manual
 * train / rollback. The model is only ever derived from the caller's own transactions.
 */
export function mlRoutes(auth: AuthService, ml: MlService) {
  const app = new Hono<AuthEnv>();
  app.use(requireAuth(auth));
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/model", (c) => {
    const active = ml.activeModel(c.get("userId"));
    if (!active) return c.body(null, 204);
    const etag = `"v${active.version}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, { ETag: etag });
    // The model JSON is embedded as text: no parse and re-stringify of megabytes.
    return c.body(
      `{"version":${active.version},"createdAt":${JSON.stringify(active.createdAt)},"metrics":${JSON.stringify(active.metrics)},"model":${active.json}}`,
      200,
      { "content-type": "application/json", ETag: etag },
    );
  });

  app.get("/status", (c) => c.json(ml.status(c.get("userId"))));

  app.post("/train", (c) => {
    const result = ml.trainNow(c.get("userId"));
    return result.status === "busy" ? c.json({ error: "busy" }, 409) : c.json(result);
  });

  app.post("/rollback", (c) => {
    const result = ml.rollback(c.get("userId"));
    return result ? c.json(result) : c.json({ error: "nothing_to_roll_back" }, 409);
  });

  return app;
}
