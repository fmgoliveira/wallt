import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type AuthEnv, requireAuth } from "../auth/routes";
import type { AuthService } from "../auth/service";
import type { Db } from "../database";
import { ATTACHMENT_ID, type FileStore, sha256Hex } from "./store";

/** Same bound as `ATTACHMENT_HARD_MAX_BYTES` in @wallt/core (the row schema refuses larger sizes anyway). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface AttachmentMeta {
  mime: string;
  size: number;
  sha256: string;
}

/**
 * `PUT|GET /files/:id` (access token required): the bytes behind an `attachments` row (ADR 0013). The row travels through
 * `/sync/push` first and says what the file must be (size, SHA-256, mime); the upload is refused unless it matches, so
 * the server never stores something the owner's own metadata does not describe.
 */
export function fileRoutes(auth: AuthService, db: Db, files: FileStore) {
  const app = new Hono<AuthEnv>();
  app.use(requireAuth(auth));
  app.use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  const meta = db.prepare(
    "SELECT mime, size, sha256 FROM attachments WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  );
  const lookup = (userId: string, id: string) =>
    ATTACHMENT_ID.test(id) ? (meta.get(id, userId) as AttachmentMeta | undefined) : undefined;

  app.put(
    "/:id",
    bodyLimit({
      maxSize: MAX_FILE_BYTES,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const userId = c.get("userId");
      const id = c.req.param("id");
      const row = lookup(userId, id);
      if (!row) return c.json({ error: "not_found" }, 404);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength !== row.size || sha256Hex(bytes) !== row.sha256) {
        return c.json({ error: "mismatch" }, 422);
      }
      files.write(userId, id, bytes);
      return c.body(null, 204);
    },
  );

  app.get("/:id", (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const row = lookup(userId, id);
    const bytes = row ? files.read(userId, id) : null;
    if (!row || !bytes) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
    });
  });

  return app;
}
