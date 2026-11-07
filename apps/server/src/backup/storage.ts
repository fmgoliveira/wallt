import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where encrypted backups live (Google Drive in production). */
export interface BackupStorage {
  upload(name: string, bytes: Uint8Array): Promise<{ id: string }>;
  list(): Promise<{ id: string; name: string; sizeBytes?: number }[]>;
  download(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
}

/** Directory-backed storage for tests and manual copies. File id = `<hex>__<name>`. */
export function createFsStorage(dir: string): BackupStorage {
  mkdirSync(dir, { recursive: true });
  return {
    async upload(name, bytes) {
      const id = `${randomBytes(4).toString("hex")}__${name}`;
      writeFileSync(join(dir, id), bytes);
      return { id };
    },
    async list() {
      return readdirSync(dir).map((id) => ({ id, name: id.slice(id.indexOf("__") + 2) }));
    },
    async download(id) {
      return new Uint8Array(readFileSync(join(dir, id)));
    },
    async delete(id) {
      rmSync(join(dir, id), { force: true });
    },
  };
}
