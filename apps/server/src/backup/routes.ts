import { Hono } from "hono";
import { type AuthEnv, requireAuth } from "../auth/routes";
import type { AuthService } from "../auth/service";
import type { BackupService } from "./service";

/**
 * `/backups` for the Settings screen (access token required): recent runs with failures, and a manual run.
 * `backup` is null when backups are not configured (no age recipient / Google client / linked account).
 */
export function backupRoutes(auth: AuthService, backup: BackupService | null) {
  const app = new Hono<AuthEnv>();
  app.use(requireAuth(auth));
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/", (c) => {
    const runs = backup?.recentRuns() ?? [];
    return c.json({
      configured: backup !== null,
      lastSuccessAt: runs.find((r) => r.status === "success")?.finishedAt ?? null,
      lastFailure: runs[0]?.status === "failed" ? runs[0] : null,
      runs,
    });
  });

  app.post("/run", async (c) => {
    if (!backup) return c.json({ error: "backups_not_configured" }, 503);
    const result = await backup.run("manual");
    if (result.status === "busy") return c.json({ error: "backup_in_progress" }, 409);
    if (result.status === "failed")
      return c.json({ error: "backup_failed", message: result.error }, 502);
    return c.json({ status: "success", sizeBytes: result.sizeBytes, pruned: result.pruned });
  });

  return app;
}
