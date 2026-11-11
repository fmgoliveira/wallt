import { sha256Bytes } from "@wallt/ingest";
import type { SyncSession } from "../sync/runtime";
import type { BlobStore } from "./blobs";

/** Device-local queue of files still to upload: `[{ id, filePath }]` as JSON in `sync_meta` (never synced). */
const QUEUE_KEY = "attachment_uploads";

export interface MetaStore {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

interface Queued {
  id: string;
  filePath: string;
}

async function readQueue(meta: MetaStore): Promise<Queued[]> {
  try {
    const parsed: unknown = JSON.parse((await meta.getMeta(QUEUE_KEY)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Queued[]) : [];
  } catch {
    return [];
  }
}

/** Remembers that a freshly added file has to reach the server (after its row has). */
export async function queueUpload(meta: MetaStore, item: Queued): Promise<void> {
  const queue = await readQueue(meta);
  if (!queue.some((q) => q.id === item.id)) {
    await meta.setMeta(QUEUE_KEY, JSON.stringify([...queue, item]));
  }
}

/** Forgets a queued upload (the attachment was removed before it was sent). */
export async function dropUpload(meta: MetaStore, id: string): Promise<void> {
  const queue = await readQueue(meta);
  if (queue.some((q) => q.id === id)) {
    await meta.setMeta(QUEUE_KEY, JSON.stringify(queue.filter((q) => q.id !== id)));
  }
}

const authed = async (session: SyncSession) => {
  const token = await session.getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : null;
};

/**
 * Uploads the queued files. Call after a sync: the server only accepts bytes for a row it already has. A file whose row is
 * not there yet (404) or that fails for lack of network stays queued; one the server rejects as different from its row
 * (422) or whose local copy is gone is dropped, retrying cannot fix it.
 */
export async function flushUploads(
  session: SyncSession,
  meta: MetaStore,
  blobs: BlobStore,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const queue = await readQueue(meta);
  if (queue.length === 0) return 0;
  const headers = await authed(session);
  if (!headers) return 0;
  const keep: Queued[] = [];
  let sent = 0;
  for (const item of queue) {
    const bytes = await blobs.read(item.filePath);
    if (!bytes) continue; // nothing left to send
    try {
      const res = await fetchFn(`${session.baseUrl}/files/${item.id}`, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/octet-stream" },
        body: bytes as BodyInit,
      });
      if (res.status === 204) sent++;
      else if (res.status !== 422) keep.push(item);
    } catch {
      keep.push(item); // offline
    }
  }
  await meta.setMeta(QUEUE_KEY, JSON.stringify(keep));
  return sent;
}

export type DownloadResult = "ok" | "unavailable" | "corrupt";

/**
 * Makes sure the file is on this device, downloading it when it is not (on demand, when somebody opens it). `unavailable`
 * = not signed in, offline, or the uploading device has not sent it yet; `corrupt` = the bytes do not match the row.
 */
export async function ensureLocal(
  att: { id: string; filePath: string; sha256: string; size: number },
  session: SyncSession | null,
  blobs: BlobStore,
  fetchFn: typeof fetch = fetch,
): Promise<DownloadResult> {
  if (await blobs.has(att.filePath)) return "ok";
  if (!session) return "unavailable";
  const headers = await authed(session);
  if (!headers) return "unavailable";
  try {
    const res = await fetchFn(`${session.baseUrl}/files/${att.id}`, { headers });
    if (!res.ok) return "unavailable";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength !== att.size || sha256Bytes(bytes) !== att.sha256) return "corrupt";
    await blobs.write(att.filePath, bytes);
    return "ok";
  } catch {
    return "unavailable";
  }
}
