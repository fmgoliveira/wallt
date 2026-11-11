import { SCHEMA_VERSION } from "@wallt/db";
import { createTestRepository } from "@wallt/db/src/repository/test-utils";
import type { Change } from "@wallt/sync";
import { describe, expect, it } from "vitest";
import { harness } from "../auth/test-harness";
import { STALE_DEVICE_MS } from "./purge";

const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;

async function setup() {
  const h = await harness();
  const { session, secret } = await h.bootstrap();
  const second = await h.login(secret, { deviceName: "Browser", platform: "web" });
  const a = h.bearer(session.accessToken);
  const b = h.bearer(second.accessToken);
  const push = (changes: Change[], who = a) =>
    h.call("POST", "/sync/push", { deviceId: "dev", schemaVersion: SCHEMA_VERSION, changes }, who);
  const pull = (since: number, who = a) =>
    h.call("GET", `/sync/pull?since=${since}&schemaVersion=${SCHEMA_VERSION}`, undefined, who);
  const purge = (who = a) => h.call("POST", "/sync/purge", undefined, who);
  const rows = (table: string) =>
    (h.db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
  return { ...h, a, b, push, pull, purge, rows };
}

async function ledger() {
  let t = Date.UTC(2026, 0, 1, 12, 1, 0);
  const d = await createTestRepository({ nodeId: "d1", clock: () => (t += 1) });
  const keep = await d.repo.accounts.create({ name: "Keep", ...eur });
  const gone = await d.repo.accounts.create({ name: "Gone", ...eur });
  return { ...d, keep, gone };
}

describe("purging deleted rows", () => {
  it("needs a token", async () => {
    const s = await setup();
    expect((await s.call("POST", "/sync/purge")).status).toBe(401);
  });

  it("keeps a deleted row until every device has applied the deletion, then removes it", async () => {
    const s = await setup();
    const d = await ledger();
    await s.push(await d.repo.sync.pending(100));
    await d.repo.accounts.delete(d.gone.id);
    await s.push(await d.repo.sync.pending(100));
    expect(s.rows("accounts")).toBe(2);

    // neither device has pulled yet: nothing may go
    const early = await s.purge();
    expect(early.json).toMatchObject({ total: 0, remaining: 1 });
    expect(early.json.waitingFor.map((w: { name: string }) => w.name).sort()).toEqual([
      "Browser",
      "Pixel",
    ]);

    // the first device has applied everything; the second has not
    const all = await s.pull(0, s.a);
    await s.pull(all.json.cursor, s.a);
    const half = await s.purge();
    expect(half.json).toMatchObject({ total: 0, remaining: 1 });
    expect(half.json.waitingFor.map((w: { name: string }) => w.name)).toEqual(["Browser"]);
    expect(s.rows("accounts")).toBe(2);

    // now the second one catches up
    const caught = await s.pull(0, s.b);
    await s.pull(caught.json.cursor, s.b);
    const done = await s.purge();
    expect(done.json).toMatchObject({ total: 1, remaining: 0, waitingFor: [] });
    expect(done.json.purged).toEqual({ accounts: 1 });
    expect(s.rows("accounts")).toBe(1); // the live account stays
    // a repeat finds nothing
    expect((await s.purge()).json.total).toBe(0);
  });

  it("does not wait for a revoked or long-unseen device", async () => {
    const s = await setup();
    const d = await ledger();
    await s.push(await d.repo.sync.pending(100));
    await d.repo.accounts.delete(d.gone.id);
    await s.push(await d.repo.sync.pending(100));
    const all = await s.pull(0, s.a);
    await s.pull(all.json.cursor, s.a);

    // the browser never pulls; it counts as lost once it has not been seen for long enough
    const longAgo = new Date(s.now() - STALE_DEVICE_MS - 24 * 60 * 60 * 1000).toISOString();
    s.db.prepare("UPDATE devices SET last_seen_at = ? WHERE name = 'Browser'").run(longAgo);
    const afterStale = await s.purge();
    expect(afterStale.json).toMatchObject({ total: 1, remaining: 0 });
  });

  it("a revoked device does not hold the purge back", async () => {
    const s = await setup();
    const d = await ledger();
    await s.push(await d.repo.sync.pending(100));
    await d.repo.accounts.delete(d.gone.id);
    await s.push(await d.repo.sync.pending(100));
    const all = await s.pull(0, s.a);
    await s.pull(all.json.cursor, s.a);
    s.db.prepare("UPDATE devices SET revoked_at = ? WHERE name = 'Browser'").run("2026-01-02");
    expect((await s.purge()).json).toMatchObject({ total: 1, remaining: 0 });
  });
});
