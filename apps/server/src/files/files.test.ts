import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_VERSION } from "@wallt/db";
import { createTestRepository } from "@wallt/db/src/repository/test-utils";
import { describe, expect, it } from "vitest";
import { harness } from "../auth/test-harness";

const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = new TextEncoder().encode("%PDF-1.4 fake receipt");

async function setup() {
  const h = await harness();
  const { session } = await h.bootstrap();
  const auth = h.bearer(session.accessToken);
  let t = Date.UTC(2026, 0, 1, 12, 1, 0);
  const d = await createTestRepository({ nodeId: "d1", clock: () => (t += 1) });
  const acc = await d.repo.accounts.create({ name: "Main", ...eur });
  const tx = await d.repo.transactions.create({
    accountId: acc.id,
    amount: -500,
    currency: "EUR",
    bookingDate: "2026-01-02",
  });
  const push = async () =>
    h.call(
      "POST",
      "/sync/push",
      { deviceId: "dev", schemaVersion: SCHEMA_VERSION, changes: await d.repo.sync.pending(100) },
      auth,
    );
  const put = (id: string, body: Uint8Array, headers: Record<string, string> = auth) =>
    h.app.request(`/files/${id}`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/octet-stream" },
      body,
    });
  const get = (id: string, headers: Record<string, string> = auth) =>
    h.app.request(`/files/${id}`, { headers });
  return { ...h, auth, d, tx, push, put, get, session };
}

describe("attachment files", () => {
  it("needs a token", async () => {
    const s = await setup();
    expect((await s.get("0190a5c4-7b1e-7a3f-8c2d-000000000001", {})).status).toBe(401);
  });

  it("stores a file that matches its synced row and serves it back", async () => {
    const s = await setup();
    const att = await s.d.repo.attachments.create({
      transactionId: s.tx.id,
      mime: "application/pdf",
      name: "receipt.pdf",
      size: bytes.byteLength,
      sha256: sha(bytes),
    });
    expect((await s.push()).json.rejected).toEqual([]);

    expect((await s.get(att.id)).status).toBe(404); // row known, bytes not uploaded yet
    expect((await s.put(att.id, bytes)).status).toBe(204);
    expect((await s.put(att.id, bytes)).status).toBe(204); // idempotent

    const res = await s.get(att.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("refuses bytes that differ from the row, and unknown rows", async () => {
    const s = await setup();
    const att = await s.d.repo.attachments.create({
      transactionId: s.tx.id,
      mime: "application/pdf",
      name: "receipt.pdf",
      size: bytes.byteLength,
      sha256: sha(bytes),
    });
    await s.push();
    expect((await s.put(att.id, new TextEncoder().encode("%PDF-1.4 fake receipt!"))).status).toBe(
      422,
    );
    expect((await s.put(att.id, new TextEncoder().encode("%PDF-1.4 fake receipt?"))).status).toBe(
      422,
    );
    expect((await s.put("0190a5c4-7b1e-7a3f-8c2d-0000000000ff", bytes)).status).toBe(404);
    expect((await s.put("../../etc/passwd", bytes)).status).toBe(404);
    expect((await s.get(att.id)).status).toBe(404);
  });

  it("does not serve a deleted attachment, and the purge removes its file", async () => {
    const s = await setup();
    const att = await s.d.repo.attachments.create({
      transactionId: s.tx.id,
      mime: "application/pdf",
      name: "receipt.pdf",
      size: bytes.byteLength,
      sha256: sha(bytes),
    });
    await s.push();
    await s.put(att.id, bytes);
    const userId = (s.db.prepare("SELECT id FROM users").get() as { id: string }).id;
    const onDisk = join(s.dir, "attachments", userId, att.id);
    expect(existsSync(onDisk)).toBe(true);

    await s.d.repo.attachments.delete(att.id);
    await s.push();
    expect((await s.get(att.id)).status).toBe(404);
    expect(existsSync(onDisk)).toBe(true); // other devices may still have to learn about the deletion

    // the only device has applied everything: the tombstone and the file go
    const all = await s.call(
      "GET",
      `/sync/pull?since=0&schemaVersion=${SCHEMA_VERSION}`,
      undefined,
      s.auth,
    );
    await s.call(
      "GET",
      `/sync/pull?since=${all.json.cursor}&schemaVersion=${SCHEMA_VERSION}`,
      undefined,
      s.auth,
    );
    const purged = await s.call("POST", "/sync/purge", undefined, s.auth);
    expect(purged.json.purged.attachments).toBe(1);
    expect(existsSync(onDisk)).toBe(false);
  });

  it("deleting a transaction tombstones its attachments", async () => {
    const s = await setup();
    const att = await s.d.repo.attachments.create({
      transactionId: s.tx.id,
      mime: "image/jpeg",
      name: "",
      size: 3,
      sha256: sha(new Uint8Array([1, 2, 3])),
    });
    await s.d.repo.transactions.delete(s.tx.id);
    expect(await s.d.repo.attachments.get(att.id)).toBeNull();
  });
});
