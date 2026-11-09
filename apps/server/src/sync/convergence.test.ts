import { RepositoryError, SCHEMA_VERSION } from "@wallt/db";
import { createTestRepository } from "@wallt/db/src/repository/test-utils";
import {
  createSyncEngine,
  SYNC_TABLES,
  type SyncEngine,
  type SyncTransport,
  SyncTransportError,
} from "@wallt/sync";
import Database from "better-sqlite3";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runMigrationsInMemory } from "./convergence-helpers";
import { createSyncService } from "./service";

/**
 * Multi-device convergence (PLAN §10 P3.4): 2-3 devices make random offline edits against one server, with skewed clocks
 * and lost responses; after they all sync, every device and the server must hold exactly the same rows.
 * (Auth and HTTP are covered in sync.test.ts; here the transport calls the sync service directly to stay fast.)
 */

const USER = "user-1";
const BASE = Date.UTC(2026, 5, 1, 12, 0, 0);

type Kind =
  | "acc+"
  | "acc~"
  | "acc-"
  | "cat+"
  | "cat~"
  | "tag+"
  | "tag~"
  | "tag-"
  | "tx+"
  | "tx~"
  | "tx-"
  | "xfer"
  | "sync"
  | "syncLost";

interface Op {
  dev: number;
  kind: Kind;
  pick: number;
  n: number;
}

const KINDS: Kind[] = [
  "acc+",
  "acc~",
  "acc-",
  "cat+",
  "cat~",
  "tag+",
  "tag~",
  "tag-",
  "tx+",
  "tx+",
  "tx+",
  "tx~",
  "tx~",
  "tx-",
  "xfer",
  "sync",
  "sync",
  "syncLost",
];

const opArb = (devices: number): fc.Arbitrary<Op> =>
  fc.record({
    dev: fc.integer({ min: 0, max: devices - 1 }),
    kind: fc.constantFrom(...KINDS),
    pick: fc.nat(1000),
    n: fc.nat(10_000),
  });

async function world(devices: number, skewsMs: number[]) {
  const db = new Database(":memory:");
  await runMigrationsInMemory(db);
  const service = createSyncService(db, () => BASE + 60_000);

  const fleet = [] as {
    id: string;
    d: Awaited<ReturnType<typeof createTestRepository>>;
    engine: SyncEngine;
    drop: { next: boolean };
  }[];

  for (let i = 0; i < devices; i++) {
    let t = BASE + (skewsMs[i] ?? 0);
    const d = await createTestRepository({
      nodeId: `dev${i}`,
      userId: USER,
      clock: () => (t += 1),
    });
    const drop = { next: false };
    auditAllWrites(d.raw);
    const transport: SyncTransport = {
      async push(req) {
        const res = service.push(USER, req);
        if (drop.next) {
          drop.next = false;
          throw new SyncTransportError("offline"); // the server applied it, the answer was lost
        }
        return res;
      },
      async pull({ since, limit }) {
        return service.pull(USER, since, limit);
      },
    };
    const engine = createSyncEngine({
      store: d.repo.sync,
      transport,
      clock: d.stamper.clock,
      deviceId: `dev${i}`,
      schemaVersion: SCHEMA_VERSION,
      now: () => BASE,
    });
    fleet.push({ id: `dev${i}`, d, engine, drop });
  }
  return { db, fleet };
}

const pickOf = <T>(list: T[], pick: number): T | undefined =>
  list.length ? list[pick % list.length] : undefined;

async function apply(f: Awaited<ReturnType<typeof world>>["fleet"][number], op: Op) {
  const { repo } = f.d;
  try {
    switch (op.kind) {
      case "acc+":
        await repo.accounts.create({
          name: `A${op.n}`,
          type: "cash",
          currency: "EUR",
          openingBalance: op.n,
        });
        break;
      case "acc~": {
        const a = pickOf(await repo.accounts.list({ includeArchived: true }), op.pick);
        if (a) await repo.accounts.update(a.id, { name: `N${op.n}`, archived: op.n % 5 === 0 });
        break;
      }
      case "acc-": {
        const a = pickOf(await repo.accounts.list({ includeArchived: true }), op.pick);
        if (a) await repo.accounts.delete(a.id);
        break;
      }
      case "cat+":
        await repo.categories.create({ name: `C${op.n}`, type: op.n % 2 ? "expense" : "income" });
        break;
      case "cat~": {
        const c = pickOf(await repo.categories.list({ includeArchived: true }), op.pick);
        if (c) await repo.categories.update(c.id, { name: `R${op.n}` });
        break;
      }
      case "tag+":
        await repo.tags.create({ name: `T${op.n}` });
        break;
      case "tag~": {
        const t = pickOf(await repo.tags.list(), op.pick);
        if (t) await repo.tags.update(t.id, { name: `U${op.n}` });
        break;
      }
      case "tag-": {
        const t = pickOf(await repo.tags.list(), op.pick);
        if (t) await repo.tags.delete(t.id);
        break;
      }
      case "tx+": {
        const a = pickOf(await repo.accounts.list(), op.pick);
        if (!a) break;
        const cats = (await repo.categories.list({ type: "expense" })).filter((c) => !c.parentId);
        const cat = op.n % 2 ? pickOf(cats, op.pick) : undefined;
        const tag = pickOf(await repo.tags.list(), op.n);
        await repo.transactions.create({
          accountId: a.id,
          amount: -((op.n % 500) + 1),
          currency: "EUR",
          bookingDate: `2026-05-${String((op.n % 28) + 1).padStart(2, "0")}`,
          ...(cat ? { categoryId: cat.id } : {}),
          ...(tag && op.n % 3 === 0 ? { tagIds: [tag.id] } : {}),
        });
        break;
      }
      case "tx~": {
        const tx = pickOf(await repo.transactions.list({ limit: 50 }), op.pick);
        if (tx && tx.kind === "expense") {
          await repo.transactions.update(tx.id, { amount: -((op.n % 900) + 1), notes: `n${op.n}` });
        }
        break;
      }
      case "tx-": {
        const tx = pickOf(await repo.transactions.list({ limit: 50 }), op.pick);
        if (tx) await repo.transactions.delete(tx.id);
        break;
      }
      case "xfer": {
        const accounts = await repo.accounts.list();
        const from = pickOf(accounts, op.pick);
        const to = pickOf(accounts, op.pick + 1 + (op.n % 3));
        if (from && to && from.id !== to.id) {
          await repo.transactions.createTransfer({
            fromAccountId: from.id,
            toAccountId: to.id,
            amount: (op.n % 400) + 1,
            bookingDate: "2026-05-15",
          });
        }
        break;
      }
      case "sync":
        await f.engine.syncNow();
        break;
      case "syncLost":
        f.drop.next = true;
        await f.engine.syncNow();
        break;
    }
  } catch (e) {
    if (!(e instanceof RepositoryError)) throw e; // refused by a business rule: not a sync concern
  }
}

/** Test-only: records every row version a device ever holds (local writes and pulled ones alike). */
function auditAllWrites(raw: import("node:sqlite").DatabaseSync) {
  raw.exec("CREATE TABLE audit (tbl TEXT, id TEXT, hlc TEXT, method TEXT)");
  for (const table of SYNC_TABLES) {
    const method = table === "transactions" ? "NEW.categorization_method" : "NULL";
    for (const ev of ["INSERT", "UPDATE"]) {
      raw.exec(
        `CREATE TRIGGER audit_${table}_${ev} AFTER ${ev} ON "${table}" BEGIN INSERT INTO audit VALUES ('${table}', NEW.id, NEW.hlc, ${method}); END`,
      );
    }
  }
}

/** The winner PLAN §4 prescribes among every version ever written: a user-chosen category first, then the latest clock. */
function expectedWinners(devices: import("node:sqlite").DatabaseSync[]) {
  const best = new Map<string, { hlc: string; user: boolean }>();
  for (const raw of devices) {
    const rows = raw.prepare("SELECT tbl, id, hlc, method FROM audit").all() as unknown as {
      tbl: string;
      id: string;
      hlc: string;
      method: string | null;
    }[];
    for (const r of rows) {
      const key = `${r.tbl}/${r.id}`;
      const cand = { hlc: r.hlc, user: r.method === "user" };
      const cur = best.get(key);
      if (!cur || (cand.user && !cur.user) || (cand.user === cur.user && cand.hlc > cur.hlc)) {
        best.set(key, cand);
      }
    }
  }
  return best;
}

type RowMap = Record<string, unknown>;
function dump(read: (table: string) => RowMap[]) {
  const out: Record<string, RowMap[]> = {};
  for (const table of SYNC_TABLES) {
    out[table] = read(table).map((r) => ({ ...r }));
    out[table]?.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return out;
}

describe("multi-device convergence", () => {
  it("devices and server end with identical rows after random offline edits", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 3 }),
        fc.array(fc.integer({ min: -3_600_000, max: 3_600_000 }), { minLength: 3, maxLength: 3 }),
        fc.array(opArb(3), { minLength: 5, maxLength: 70 }),
        async (devices, skews, rawOps) => {
          const { db, fleet } = await world(devices, skews);
          // shared starting data, so that devices really do edit the same rows concurrently
          const first = fleet[0];
          if (first) {
            for (const [kind, n] of [
              ["acc+", 1],
              ["acc+", 2],
              ["cat+", 3],
              ["tag+", 4],
              ["tx+", 5],
            ] as const) {
              await apply(first, { dev: 0, kind, pick: 0, n });
            }
          }
          for (const f of fleet) await f.engine.syncNow();
          for (const f of fleet) await f.engine.syncNow();
          for (const op of rawOps) {
            const f = fleet[op.dev % devices];
            if (f) await apply(f, op);
          }
          // everyone comes back online: a few rounds are enough for pushes, stale replies and echoes to settle
          for (let round = 0; round < 4; round++) {
            for (const f of fleet) await f.engine.syncNow();
          }

          for (const f of fleet) {
            const state = f.engine.getState();
            expect(state.problem).toBeNull();
            expect(state.failed).toBe(0);
            expect(state.pending).toBe(0);
          }
          const server = dump((t) => db.prepare(`SELECT * FROM "${t}"`).all() as RowMap[]);
          for (const f of fleet) {
            const local = dump(
              (t) => f.d.raw.prepare(`SELECT * FROM "${t}"`).all() as unknown as RowMap[],
            );
            expect(local).toEqual(server);
          }
          // and the row that survived is the prescribed winner of everything ever written, not just "some" version
          const winners = expectedWinners(fleet.map((f) => f.d.raw));
          const survivors = new Map<string, string>();
          for (const t of SYNC_TABLES) {
            for (const r of server[t] ?? []) survivors.set(`${t}/${r.id}`, String(r.hlc));
          }
          expect(survivors.size).toBe(winners.size);
          for (const [key, w] of winners) expect(survivors.get(key)).toBe(w.hlc);
          db.close();
        },
      ),
      { numRuns: 40 },
    );
  }, 120_000);

  it("a response lost after the server applied a push does not duplicate or lose anything", async () => {
    const { db, fleet } = await world(2, [0, 0]);
    const [a, b] = fleet;
    if (!a || !b) throw new Error("fleet");
    await apply(a, { dev: 0, kind: "acc+", pick: 0, n: 1 });
    a.drop.next = true;
    await a.engine.syncNow();
    expect(a.engine.getState().problem).toBe("offline");
    expect(a.engine.getState().pending).toBe(1);
    await a.engine.syncNow(); // retried: same hlc, idempotent
    await b.engine.syncNow();
    expect(a.engine.getState()).toMatchObject({ problem: null, pending: 0 });
    expect((await b.d.repo.accounts.list()).map((x) => x.name)).toEqual(["A1"]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM "accounts"').get()).toEqual({ n: 1 });
    db.close();
  });

  it("concurrent edits to one row: the later clock wins on every device", async () => {
    const { db, fleet } = await world(2, [0, 5000]); // device 1's clock runs 5 s ahead
    const [a, b] = fleet;
    if (!a || !b) throw new Error("fleet");
    const acc = await a.d.repo.accounts.create({
      name: "base",
      type: "cash",
      currency: "EUR",
      openingBalance: 0,
    });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.d.repo.accounts.update(acc.id, { name: "from a" }); // offline edits on both
    await b.d.repo.accounts.update(acc.id, { name: "from b" });
    await b.engine.syncNow(); // the later clock pushes first...
    await a.engine.syncNow(); // ...so the older edit arrives second and must lose
    await b.engine.syncNow();
    for (const f of fleet) expect((await f.d.repo.accounts.get(acc.id))?.name).toBe("from b");
    db.close();
  });
});
