import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Ids (attachments, users) are UUIDs; anything else never reaches the file system. */
export const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Attachment bytes on disk: `<dataDir>/attachments/<userId>/<attachmentId>` (ADR 0013). The directory is part of
 * every backup (`backup/archive.ts`). Writes go through a temp file and a rename, so a crash never leaves a torn file.
 */
export function createFileStore(dataDir: string) {
  const root = join(dataDir, "attachments");
  const pathOf = (userId: string, id: string) => {
    if (!ATTACHMENT_ID.test(userId)) throw new Error("bad user id");
    if (!ATTACHMENT_ID.test(id)) throw new Error("bad attachment id");
    return join(root, userId, id);
  };
  return {
    write(userId: string, id: string, bytes: Uint8Array): void {
      const file = pathOf(userId, id);
      mkdirSync(join(root, userId), { recursive: true });
      const tmp = `${file}.part`;
      writeFileSync(tmp, bytes);
      renameSync(tmp, file);
    },
    read(userId: string, id: string): Buffer | null {
      const file = pathOf(userId, id);
      return existsSync(file) ? readFileSync(file) : null;
    },
    remove(userId: string, id: string): void {
      rmSync(pathOf(userId, id), { force: true });
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;
