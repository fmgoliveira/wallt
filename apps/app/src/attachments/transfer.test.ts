import { sha256Bytes } from "@wallt/ingest";
import { describe, expect, it } from "vitest";
import type { SyncSession } from "../sync/runtime";
import type { BlobStore } from "./blobs";
import { dropUpload, ensureLocal, flushUploads, queueUpload } from "./transfer";

const session: SyncSession = {
  email: "a@b.c",
  baseUrl: "https://wallt.test",
  userId: "u",
  getAccessToken: async () => "tok",
};

function memoryMeta() {
  const m = new Map<string, string>();
  return {
    getMeta: async (k: string) => m.get(k) ?? null,
    setMeta: async (k: string, v: string) => void m.set(k, v),
  };
}

function memoryBlobs(
  initial: Record<string, Uint8Array> = {},
): BlobStore & { files: Map<string, Uint8Array> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    has: async (n) => files.has(n),
    write: async (n, b) => void files.set(n, b),
    read: async (n) => files.get(n) ?? null,
    remove: async (n) => void files.delete(n),
    url: async () => null,
    release: () => undefined,
  };
}

const bytes = Uint8Array.from([1, 2, 3, 4]);
const res = (status: number, body?: Uint8Array) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => body?.buffer,
  }) as Response;

describe("upload queue", () => {
  it("uploads queued files and clears them", async () => {
    const meta = memoryMeta();
    const blobs = memoryBlobs({ "a.jpg": bytes });
    await queueUpload(meta, { id: "a", filePath: "a.jpg" });
    await queueUpload(meta, { id: "a", filePath: "a.jpg" }); // no duplicates
    const calls: string[] = [];
    const sent = await flushUploads(session, meta, blobs, async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return res(204);
    });
    expect(sent).toBe(1);
    expect(calls).toEqual(["PUT https://wallt.test/files/a"]);
    expect(await flushUploads(session, meta, blobs, async () => res(500))).toBe(0); // queue is empty
  });

  it("keeps a file whose row is not on the server yet, or while offline", async () => {
    const meta = memoryMeta();
    const blobs = memoryBlobs({ "a.jpg": bytes, "b.jpg": bytes });
    await queueUpload(meta, { id: "a", filePath: "a.jpg" });
    await queueUpload(meta, { id: "b", filePath: "b.jpg" });
    await flushUploads(session, meta, blobs, async (url) => {
      if (String(url).endsWith("/a")) return res(404);
      throw new TypeError("offline");
    });
    const later: string[] = [];
    await flushUploads(session, meta, blobs, async (url) => {
      later.push(String(url));
      return res(204);
    });
    expect(later.sort()).toEqual(["https://wallt.test/files/a", "https://wallt.test/files/b"]);
  });

  it("drops a file the server calls different from its row, and one that is gone locally", async () => {
    const meta = memoryMeta();
    const blobs = memoryBlobs({ "a.jpg": bytes });
    await queueUpload(meta, { id: "a", filePath: "a.jpg" });
    await queueUpload(meta, { id: "gone", filePath: "gone.jpg" });
    await flushUploads(session, meta, blobs, async () => res(422));
    let called = 0;
    await flushUploads(session, meta, blobs, async () => (called++, res(204)));
    expect(called).toBe(0);
  });

  it("dropUpload forgets a queued file", async () => {
    const meta = memoryMeta();
    const blobs = memoryBlobs({ "a.jpg": bytes });
    await queueUpload(meta, { id: "a", filePath: "a.jpg" });
    await dropUpload(meta, "a");
    let called = 0;
    await flushUploads(session, meta, blobs, async () => (called++, res(204)));
    expect(called).toBe(0);
  });
});

describe("ensureLocal", () => {
  const att = { id: "a", filePath: "a.jpg", size: bytes.byteLength, sha256: sha256Bytes(bytes) };

  it("does nothing when the file is already here", async () => {
    const blobs = memoryBlobs({ "a.jpg": bytes });
    expect(await ensureLocal(att, null, blobs, async () => res(500))).toBe("ok");
  });

  it("downloads, verifies and stores", async () => {
    const blobs = memoryBlobs();
    expect(await ensureLocal(att, session, blobs, async () => res(200, bytes))).toBe("ok");
    expect(blobs.files.get("a.jpg")).toEqual(bytes);
  });

  it("is unavailable when signed out, offline or not uploaded yet", async () => {
    expect(await ensureLocal(att, null, memoryBlobs())).toBe("unavailable");
    expect(await ensureLocal(att, session, memoryBlobs(), async () => res(404))).toBe(
      "unavailable",
    );
    expect(
      await ensureLocal(att, session, memoryBlobs(), async () => {
        throw new TypeError("offline");
      }),
    ).toBe("unavailable");
  });

  it("discards bytes that do not match the row", async () => {
    const blobs = memoryBlobs();
    const tampered = Uint8Array.from([9, 9, 9, 9]);
    expect(await ensureLocal(att, session, blobs, async () => res(200, tampered))).toBe("corrupt");
    expect(blobs.files.size).toBe(0);
  });
});
