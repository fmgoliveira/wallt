import { SCHEMA_VERSION } from "@wallt/db";
import { createTestRepository } from "@wallt/db/src/repository/test-utils";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { harness, type J } from "../auth/test-harness";
import { createMlService, RETRAIN_AFTER } from "./service";

const log = pino({ level: "silent" });
const eur = { type: "cash", currency: "EUR", openingBalance: 0 } as const;

async function setup(tolerance?: number) {
  let ml!: ReturnType<typeof createMlService>;
  const h = await harness({
    setupToken: "setup-token-0123456789",
    ml: (db) => {
      ml = createMlService({ db, log, ...(tolerance === undefined ? {} : { tolerance }) });
      return ml;
    },
  });
  const { session } = await h.bootstrap();
  const auth = h.bearer(session.accessToken);
  let t = Date.UTC(2026, 0, 1, 12, 1, 0);
  const d = await createTestRepository({ nodeId: "d1", clock: () => (t += 1) });
  const account = await d.repo.accounts.create({ name: "A", ...eur });
  const groceries = await d.repo.categories.create({ name: "Groceries", type: "expense" });
  const fuel = await d.repo.categories.create({ name: "Fuel", type: "expense" });

  let n = 0;
  /** Adds `count` user-categorised transactions alternating between two merchants (labels flipped when `flip`). */
  const add = async (count: number, opts: { flip?: boolean; method?: "user" | "ml" } = {}) => {
    for (let i = 0; i < count; i++, n++) {
      const lidl = n % 2 === 0;
      await d.repo.transactions.create({
        accountId: account.id,
        amount: lidl ? -2000 : -5000,
        currency: "EUR",
        bookingDate: "2026-02-10",
        payee: lidl ? "Lidl" : "Galp",
        descriptionRaw: lidl ? `LIDL LISBOA ${n}` : `GALP ENERGIA ${n}`,
        descriptionClean: lidl ? "LIDL LISBOA" : "GALP ENERGIA",
        categoryId: lidl !== !!opts.flip ? groceries.id : fuel.id,
        ...(opts.method === "ml"
          ? { categorization: { method: "ml" as const, confidence: 0.9, needsReview: false } }
          : {}),
      });
    }
  };
  const push = async () => {
    const changes = await d.repo.sync.pending(5000);
    const res = await h.call(
      "POST",
      "/sync/push",
      { deviceId: "d1", schemaVersion: SCHEMA_VERSION, changes },
      auth,
    );
    expect(res.status).toBe(200);
    await d.repo.sync.acknowledge(changes, res.json as never);
  };
  const get = (path: string, headers: Record<string, string> = {}) =>
    h.call("GET", path, undefined, { ...auth, ...headers });
  const post = (path: string) => h.call("POST", path, undefined, auth);
  return { ...h, ml, add, push, get, post, groceries: groceries.id, fuel: fuel.id };
}

describe("ML API", () => {
  it("requires an access token", async () => {
    const s = await setup();
    for (const path of ["/ml/model", "/ml/status"]) {
      expect((await s.call("GET", path)).status).toBe(401);
    }
    expect((await s.call("POST", "/ml/train")).status).toBe(401);
    expect((await s.call("POST", "/ml/rollback")).status).toBe(401);
  });

  it("has nothing to serve until it has learned something", async () => {
    const s = await setup();
    expect((await s.get("/ml/model")).status).toBe(204);
    await s.add(10);
    await s.push();
    const r = await s.post("/ml/train");
    expect(r.json).toEqual({ status: "skipped", reason: "too_little_data" });
    expect((await s.get("/ml/status")).json).toMatchObject({
      active: null,
      labelled: 10,
      minExamples: 60,
    });
  });

  it("trains from user-categorised rows only and serves the model with an ETag", async () => {
    const s = await setup();
    await s.add(160);
    await s.add(40, { method: "ml" }); // guesses are not labels
    await s.push();

    const trained = await s.post("/ml/train");
    expect(trained.json).toMatchObject({ status: "trained", version: 1 });
    expect(trained.json.metrics.accuracy).toBeGreaterThan(0.95);
    expect(trained.json.metrics.trainedOn).toBeLessThanOrEqual(160);

    const model = await s.get("/ml/model");
    expect(model.status).toBe(200);
    expect(model.headers.get("etag")).toBe('"v1"');
    expect(model.json.version).toBe(1);
    expect(model.json.model.classes.sort()).toEqual([s.fuel, s.groceries].sort());
    expect(model.json.metrics.heldOut).toBeGreaterThan(10);

    expect((await s.get("/ml/model", { "if-none-match": '"v1"' })).status).toBe(304);
    const status = await s.get("/ml/status");
    expect(status.json).toMatchObject({ labelled: 160, newSinceTraining: 0 });
    expect(status.json.active).toMatchObject({ version: 1, trainedOnCount: 160 });
  });

  it("retrains only when enough changed, and the nightly run takes any change", async () => {
    const s = await setup();
    await s.add(100);
    await s.push();
    expect(s.ml.trainAll(RETRAIN_AFTER)).toMatchObject({ trained: 1 });
    expect(s.ml.trainAll(1)).toMatchObject({ trained: 0, skipped: 1 }); // nothing new

    await s.add(5);
    await s.push();
    expect(s.ml.trainAll(RETRAIN_AFTER)).toMatchObject({ trained: 0 }); // 5 < 20
    expect(s.ml.trainAll(1)).toMatchObject({ trained: 1 }); // nightly
    expect((await s.get("/ml/status")).json.active.version).toBe(2);

    await s.add(RETRAIN_AFTER);
    await s.push();
    expect(s.ml.trainAll(RETRAIN_AFTER)).toMatchObject({ trained: 1 });
    expect((await s.get("/ml/status")).json.active.version).toBe(3);
  });

  it("keeps the active model when a new one scores lower than it", async () => {
    // tolerance -1: a retrain must beat the active model by 100 points, so any retrain is "worse"
    const s = await setup(-1);
    await s.add(120);
    await s.push();
    expect((await s.post("/ml/train")).json).toMatchObject({ status: "trained", version: 1 });

    await s.add(60);
    await s.push();
    const bad = await s.post("/ml/train");
    expect(bad.json.status).toBe("rejected");
    expect(bad.json.version).toBe(2);
    expect(bad.json.metrics.rejected).toMatch(/below the active model/);
    expect((await s.get("/ml/status")).json.active.version).toBe(1);
    expect((await s.get("/ml/model")).json.version).toBe(1);
    // it does not retrain in a loop on the same data, and a rejected version is no rollback target
    expect(s.ml.trainAll(1)).toMatchObject({ trained: 0, rejected: 0 });
    expect((await s.get("/ml/status")).json.previous).toBeNull();
    expect((await s.post("/ml/rollback")).status).toBe(409);
  });

  it("rolls back to the previous version, once", async () => {
    const s = await setup();
    await s.add(100);
    await s.push();
    await s.post("/ml/train");
    await s.add(30);
    await s.push();
    expect((await s.post("/ml/train")).json).toMatchObject({ status: "trained", version: 2 });

    expect((await s.get("/ml/status")).json.previous).toMatchObject({ version: 1 });
    expect((await s.post("/ml/rollback")).json).toEqual({ version: 1 });
    expect((await s.get("/ml/model")).json.version).toBe(1);
    const again = await s.post("/ml/rollback");
    expect(again.status).toBe(409);
  });

  it("scopes models to the signed-in user", async () => {
    const s = await setup();
    await s.add(100);
    await s.push();
    await s.post("/ml/train");
    const other = s.db.prepare("SELECT count(*) AS n FROM ml_models WHERE user_id != ?");
    const me = (s.db.prepare("SELECT id FROM users").get() as J).id;
    expect((other.get(me) as J).n).toBe(0);
  });
});
