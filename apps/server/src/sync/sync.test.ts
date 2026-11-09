import { SCHEMA_VERSION } from "@wallt/db";
import { createTestRepository } from "@wallt/db/src/repository/test-utils";
import type { Change } from "@wallt/sync";
import { describe, expect, it } from "vitest";
import { harness, type J } from "../auth/test-harness";

const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;

async function setup() {
  const h = await harness();
  const { session } = await h.bootstrap();
  const auth = h.bearer(session.accessToken);
  const push = (changes: Change[], schemaVersion = SCHEMA_VERSION, headers = auth) =>
    h.call("POST", "/sync/push", { deviceId: "dev-1", schemaVersion, changes }, headers);
  const pull = (since = 0, limit?: number, schemaVersion = SCHEMA_VERSION) =>
    h.call(
      "GET",
      `/sync/pull?since=${since}&schemaVersion=${schemaVersion}${limit ? `&limit=${limit}` : ""}`,
      undefined,
      auth,
    );
  return { ...h, push, pull, bootstrapToken: async () => session.accessToken as string };
}

async function device(nodeId = "d1") {
  let t = Date.UTC(2026, 0, 1, 12, 1, 0); // just after the harness clock, so no clock is "from the future"
  const d = await createTestRepository({ nodeId, clock: () => (t += 1) });
  const changes = async () => d.repo.sync.pending(100);
  return { ...d, changes };
}

describe("sync API", () => {
  it("requires an access token", async () => {
    const s = await setup();
    expect((await s.call("POST", "/sync/push", { changes: [] })).status).toBe(401);
    expect((await s.call("GET", "/sync/pull?since=0&schemaVersion=1")).status).toBe(401);
  });

  it("assigns increasing server_seq, forces the owner, and pages through pulls", async () => {
    const s = await setup();
    const d = await device();
    for (const n of ["A", "B", "C"]) await d.repo.accounts.create({ name: n, ...eur });
    const changes = await d.changes();

    const pushed = await s.push(changes);
    expect(pushed.status).toBe(200);
    expect(pushed.json.rejected).toEqual([]);
    expect(pushed.json.accepted.map((a: J) => a.serverSeq)).toEqual([1, 2, 3]);

    const first = await s.pull(0, 2);
    expect(first.json.changes).toHaveLength(2);
    expect(first.json).toMatchObject({ cursor: 2, hasMore: true });
    const second = await s.pull(first.json.cursor, 2);
    expect(second.json.changes).toHaveLength(1);
    expect(second.json).toMatchObject({ cursor: 3, hasMore: false });
    // the server owns user_id: the device's placeholder "local" was replaced
    const owners = new Set(
      [...first.json.changes, ...second.json.changes].map((c: J) => c.row.user_id),
    );
    expect(owners.size).toBe(1);
    expect(owners.has("local")).toBe(false);
    expect((await s.pull(3)).json).toMatchObject({ changes: [], cursor: 3, hasMore: false });
  });

  it("is idempotent when a push is retried", async () => {
    const s = await setup();
    const d = await device();
    await d.repo.accounts.create({ name: "A", ...eur });
    const changes = await d.changes();
    const a = await s.push(changes);
    const b = await s.push(changes);
    expect(b.json.accepted).toEqual(a.json.accepted);
    expect((await s.pull(0)).json.changes).toHaveLength(1);
    // a later edit still gets a fresh seq
    const edited = await d.repo.accounts.update(changes[0]?.id as string, { name: "A2" });
    const c = await s.push(await d.changes());
    expect(c.json.accepted[0]).toMatchObject({ hlc: edited.hlc, serverSeq: 2 });
  });

  it("answers a push that loses last-writer-wins with the stored row", async () => {
    const s = await setup();
    const d1 = await device("d1");
    const a = await d1.repo.accounts.create({ name: "from d1", ...eur });
    const [c1] = await d1.changes();
    await s.push([c1 as Change]);

    // d2 writes the same row id with an older clock
    const stale = {
      ...(c1 as Change),
      hlc: `${"0".repeat(12)}-0000-d2`,
      row: { ...(c1 as Change).row, hlc: `${"0".repeat(12)}-0000-d2`, name: "from d2" },
    };
    const r = await s.push([stale]);
    expect(r.json.accepted).toEqual([]);
    expect(r.json.rejected[0]).toMatchObject({ id: a.id, reason: "stale" });
    expect(r.json.rejected[0].current.name).toBe("from d1");
  });

  it("propagates tombstones", async () => {
    const s = await setup();
    const d = await device();
    const a = await d.repo.accounts.create({ name: "A", ...eur });
    await s.push(await d.changes());
    await d.repo.accounts.delete(a.id);
    const [del] = await d.changes();
    expect(del?.op).toBe("delete");
    await s.push([del as Change]);
    const pulled = await s.pull(0);
    expect(pulled.json.changes).toHaveLength(1);
    expect(pulled.json.changes[0].row.deleted_at).not.toBeNull();
  });

  it("a user-chosen category beats a newer classifier write", async () => {
    const s = await setup();
    const d = await device();
    const acc = await d.repo.accounts.create({ name: "A", ...eur });
    const cat = await d.repo.categories.create({ name: "c", type: "expense" });
    const tx = await d.repo.transactions.create({
      accountId: acc.id,
      amount: -100,
      currency: "EUR",
      bookingDate: "2026-11-01",
      categoryId: cat.id,
    });
    await s.push(await d.changes());
    const [txChange] = (await s.pull(0)).json.changes.filter((c: J) => c.row.id === tx.id);
    const mlHlc = `${(s.now() + 60_000).toString(16).padStart(12, "0")}-0000-ml`;
    const ml = {
      table: "transactions",
      id: tx.id,
      op: "put",
      hlc: mlHlc,
      row: {
        ...txChange.row,
        category_id: null,
        categorization_method: "ml",
        hlc: mlHlc,
      },
    } as Change;
    const r = await s.push([ml]);
    expect(r.json.rejected[0]).toMatchObject({ reason: "stale" });
  });

  it("refuses malformed rows, mismatched clocks and far-future clocks", async () => {
    const s = await setup();
    const d = await device();
    await d.repo.accounts.create({ name: "A", ...eur });
    const [c] = (await d.changes()) as [Change];
    const reasons = async (change: Change) => (await s.push([change])).json.rejected[0]?.reason;

    expect(await reasons({ ...c, row: { ...c.row, bogus: 1 } })).toBe("invalid");
    expect(await reasons({ ...c, row: { ...c.row, opening_balance: 1.5 } })).toBe("invalid");
    expect(await reasons({ ...c, row: { ...c.row, id: "other" } })).toBe("invalid");
    expect(await reasons({ ...c, op: "delete" })).toBe("invalid");
    expect(await reasons({ ...c, hlc: "garbage", row: { ...c.row, hlc: "garbage" } })).toBe(
      "invalid",
    );
    const future = `${(s.now() + 3 * 24 * 3600_000).toString(16).padStart(12, "0")}-0000-d1`;
    expect(await reasons({ ...c, hlc: future, row: { ...c.row, hlc: future } })).toBe("hlc_future");
    expect((await s.pull(0)).json.changes).toEqual([]);
  });

  it("refuses to overwrite another user's row", async () => {
    const s = await setup();
    const d = await device();
    const a = await d.repo.accounts.create({ name: "A", ...eur });
    await s.push(await d.changes());
    s.db.prepare("UPDATE accounts SET user_id = 'someone-else' WHERE id = ?").run(a.id);
    const edited = await d.repo.accounts.update(a.id, { name: "hijack" });
    const r = await s.push(await d.changes());
    expect(r.json.rejected[0]).toMatchObject({ id: a.id, hlc: edited.hlc, reason: "forbidden" });
    expect((await s.pull(0)).json.changes).toEqual([]); // and it is not visible to this user
  });

  it("rejects clients on another schema version", async () => {
    const s = await setup();
    const old = await s.push([], SCHEMA_VERSION - 1);
    expect(old.status).toBe(409);
    expect(old.json).toMatchObject({
      error: "schema_outdated",
      serverSchemaVersion: SCHEMA_VERSION,
    });
    expect((await s.push([], SCHEMA_VERSION + 1)).json.error).toBe("server_outdated");
    expect((await s.pull(0, 10, SCHEMA_VERSION - 1)).status).toBe(409);
  });

  it("validates request shape", async () => {
    const s = await setup();
    const auth = s.bearer((await s.bootstrapToken()) as string);
    expect((await s.call("POST", "/sync/push", { nope: 1 }, auth)).status).toBe(400);
    expect(
      (await s.call("GET", "/sync/pull?since=-1&schemaVersion=1", undefined, auth)).status,
    ).toBe(400);
    expect((await s.call("GET", "/sync/pull?since=0", undefined, auth)).status).toBe(400);
  });
});
