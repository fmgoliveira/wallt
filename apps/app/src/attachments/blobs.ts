import { Platform } from "react-native";

/**
 * Where attachment bytes live on this device (ADR 0013): the browser's private file system (OPFS, like the local
 * database) on web, the app's document directory on Android. Keyed by the attachment's `filePath` (`<id>.<ext>`).
 * Native modules are `require`d lazily so the web bundle never loads them.
 */
export interface BlobStore {
  has(name: string): Promise<boolean>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  remove(name: string): Promise<void>;
  /**
   * A URL an `<Image>` or a viewer can load, or null when the file is not on this device. On web it is an object URL:
   * pass it to `release` when done.
   */
  url(name: string, mime: string): Promise<string | null>;
  release(url: string): void;
}

/** Only what the code below uses of the File System Access API (TypeScript's DOM lib does not ship OPFS everywhere). */
interface OpfsFile {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
}
interface OpfsDir {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFile>;
  removeEntry(name: string): Promise<void>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDir>;
}

function webStore(): BlobStore {
  const dir = async (): Promise<OpfsDir> => {
    const root = await (
      navigator.storage as unknown as { getDirectory(): Promise<OpfsDir> }
    ).getDirectory();
    return root.getDirectoryHandle("attachments", { create: true });
  };
  const open = async (name: string): Promise<File | null> => {
    try {
      return await (await (await dir()).getFileHandle(name)).getFile();
    } catch {
      return null; // NotFoundError: not on this device
    }
  };
  return {
    has: async (name) => (await open(name)) !== null,
    async write(name, bytes) {
      const handle = await (await dir()).getFileHandle(name, { create: true });
      const out = await handle.createWritable();
      await out.write(bytes);
      await out.close();
    },
    async read(name) {
      const file = await open(name);
      return file ? new Uint8Array(await file.arrayBuffer()) : null;
    },
    async remove(name) {
      try {
        await (await dir()).removeEntry(name);
      } catch {
        // already gone
      }
    },
    async url(name, mime) {
      const file = await open(name);
      return file
        ? URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: mime }))
        : null;
    },
    release: (url) => URL.revokeObjectURL(url),
  };
}

function nativeStore(): BlobStore {
  const fs = () => require("expo-file-system") as typeof import("expo-file-system");
  const folder = () => {
    const { Directory, Paths } = fs();
    const d = new Directory(Paths.document, "attachments");
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    return d;
  };
  const file = (name: string) => new (fs().File)(folder(), name);
  return {
    has: async (name) => file(name).exists,
    async write(name, bytes) {
      const f = file(name);
      if (!f.exists) f.create();
      await f.write(bytes);
    },
    async read(name) {
      const f = file(name);
      return f.exists ? await f.bytes() : null;
    },
    async remove(name) {
      const f = file(name);
      if (f.exists) f.delete();
    },
    async url(name) {
      const f = file(name);
      return f.exists ? f.uri : null;
    },
    release: () => undefined,
  };
}

let store: BlobStore | null = null;

/** The device's attachment file store. */
export function getBlobStore(): BlobStore {
  store ??= Platform.OS === "web" ? webStore() : nativeStore();
  return store;
}
