import { describe, expect, it } from "vitest";
import type { ParsedRow } from "./mapping";
import {
  cleanDescription,
  dedupHash,
  derivePayee,
  descriptionSimilarity,
  type ExistingTx,
  lookupRange,
  planImport,
} from "./pipeline";
import { sha256Hex } from "./sha256";

describe("sha256", () => {
  it("matches the FIPS test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
  it("hashes non-ASCII text as UTF-8", () => {
    expect(sha256Hex("Café")).toBe(
      "73473dcc12b763085904a5279d048c4d5b3b008c46f1f32443b99de04aa83a14",
    );
  });
});

describe("cleanDescription / derivePayee", () => {
  it("strips card fragments, embedded dates and long references", () => {
    expect(cleanDescription("COMPRA CONTINENTE CARTAO 1234 02/01 REF: 99887766")).toBe(
      "COMPRA CONTINENTE",
    );
    expect(cleanDescription("TRF A FAVOR DE JOAO  - 123456789012")).toBe("TRF A FAVOR DE JOAO");
    expect(cleanDescription("   ")).toBe("");
  });
  it("never returns an empty string for a non-empty description", () => {
    expect(cleanDescription("12345678901")).toBe("12345678901");
  });
  it("prefers aliases, then the file payee, then the description", () => {
    const aliases = [{ pattern: "CONTINENTE.*", payee: "Continente" }];
    expect(
      derivePayee(
        { payee: null, description: "COMPRA CONTINENTE 12" },
        "COMPRA CONTINENTE",
        aliases,
      ),
    ).toBe("Continente");
    expect(derivePayee({ payee: "Lidl  Lisboa", description: "x" }, "x", aliases)).toBe(
      "Lidl Lisboa",
    );
    expect(derivePayee({ payee: null, description: "Padaria" }, "Padaria", aliases)).toBe(
      "Padaria",
    );
    // an invalid regex falls back to a plain substring match
    expect(
      derivePayee({ payee: null, description: "a(b" }, "a(b", [{ pattern: "(b", payee: "B" }]),
    ).toBe("B");
  });
});

describe("descriptionSimilarity", () => {
  it("scores token overlap", () => {
    expect(
      descriptionSimilarity("Compra Continente", "COMPRA CONTINENTE 1234"),
    ).toBeGreaterThanOrEqual(0.5);
    expect(descriptionSimilarity("Renda", "Padaria")).toBe(0);
    expect(descriptionSimilarity("", "")).toBe(1);
  });
});

let n = 0;
const row = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  rowIndex: n++,
  bookingDate: "2024-01-10",
  valueDate: null,
  amount: -1000,
  currency: "EUR",
  description: "CAFE CENTRAL",
  payee: null,
  reference: null,
  category: null,
  balance: null,
  externalId: null,
  ...over,
});
const tx = (over: Partial<ExistingTx> = {}): ExistingTx => ({
  id: `t${n++}`,
  accountId: "a1",
  bookingDate: "2024-01-10",
  amount: -1000,
  currency: "EUR",
  status: "booked",
  kind: "expense",
  descriptionRaw: "CAFE CENTRAL",
  descriptionClean: "CAFE CENTRAL",
  externalId: null,
  dedupHash: "",
  ...over,
});
const plan = (rows: ParsedRow[], existing: ExistingTx[] = [], others: ExistingTx[] = []) =>
  planImport({ accountId: "a1", currency: "EUR", rows, existing, others });

describe("planImport: dedup", () => {
  it("inserts everything into an empty account and numbers identical rows", () => {
    const p = plan([row(), row(), row({ amount: -500 })]);
    expect(p.summary).toMatchObject({ total: 3, inserted: 3, duplicates: 0, needsReview: 0 });
    expect(p.rows.map((r) => r.occurrence)).toEqual([0, 1, 0]);
    expect(new Set(p.rows.map((r) => r.dedupHash)).size).toBe(3);
  });

  it("re-importing the same file creates nothing new (hash, including identical same-day rows)", () => {
    const rows = [row(), row(), row({ amount: -500 })];
    const first = plan(rows);
    const stored = first.rows.map((r, i) =>
      tx({ id: `s${i}`, amount: r.row.amount, dedupHash: r.dedupHash }),
    );
    const again = plan(rows, stored);
    expect(again.summary).toMatchObject({ inserted: 0, duplicates: 3 });
  });

  it("an overlapping import only adds the genuinely new occurrence", () => {
    const old = plan([row()]);
    const stored = [tx({ id: "s0", dedupHash: old.rows[0]?.dedupHash ?? "" })];
    const next = plan([row(), row()], stored);
    expect(next.rows.map((r) => r.action)).toEqual(["duplicate", "insert"]);
    expect(next.summary.needsReview).toBe(0);
  });

  it("matches by the bank's external id first, once per existing row", () => {
    const stored = [tx({ id: "s0", externalId: "F1" })];
    const p = plan([row({ externalId: "F1" }), row({ externalId: "F1", amount: -777 })], stored);
    expect(p.rows.map((r) => r.action)).toEqual(["duplicate", "insert"]);
    expect(p.rows[0]?.existingId).toBe("s0");
  });

  it("updates a pending transaction instead of inserting the booked one", () => {
    const stored = [
      tx({
        id: "p1",
        status: "pending",
        bookingDate: "2024-01-08",
        descriptionClean: "CAFE CENTRAL",
      }),
    ];
    const p = plan([row()], stored);
    expect(p.rows[0]).toMatchObject({ action: "update-pending", existingId: "p1" });
    expect(p.summary).toMatchObject({ inserted: 0, updatedPending: 1 });
  });

  it("flags several pending candidates for review instead of guessing", () => {
    const stored = [
      tx({ id: "p1", status: "pending", bookingDate: "2024-01-08" }),
      tx({ id: "p2", status: "pending", bookingDate: "2024-01-09" }),
    ];
    const p = plan([row()], stored);
    expect(p.rows[0]).toMatchObject({ action: "insert", needsReview: true });
  });

  it("does not match pending rows with other amounts, far dates or other text", () => {
    const stored = [
      tx({ id: "p1", status: "pending", amount: -999 }),
      tx({ id: "p2", status: "pending", bookingDate: "2024-01-20" }),
      tx({ id: "p3", status: "pending", descriptionClean: "RENDA", descriptionRaw: "RENDA" }),
    ];
    expect(plan([row()], stored).rows[0]?.action).toBe("insert");
  });

  it("never drops a near-match of a hand-entered transaction: inserts it flagged for review", () => {
    const stored = [tx({ id: "m1", bookingDate: "2024-01-11" })];
    const p = plan([row()], stored);
    expect(p.rows[0]).toMatchObject({ action: "insert", needsReview: true, existingId: "m1" });
    expect(p.summary.needsReview).toBe(1);
  });

  it("does not flag when the hand-entered row differs in amount or is two days away", () => {
    const stored = [tx({ amount: -1001 }), tx({ bookingDate: "2024-01-12" })];
    expect(plan([row()], stored).summary.needsReview).toBe(0);
  });

  it("hashes depend on the account, date, amount, text and occurrence", () => {
    const h = dedupHash("a1", "2024-01-10", -1000, "Café  Central", 0);
    expect(h).toBe(dedupHash("a1", "2024-01-10", -1000, "CAFE CENTRAL", 0)); // case/accents/spacing ignored
    expect(h).not.toBe(dedupHash("a2", "2024-01-10", -1000, "Café Central", 0));
    expect(h).not.toBe(dedupHash("a1", "2024-01-11", -1000, "Café Central", 0));
    expect(h).not.toBe(dedupHash("a1", "2024-01-10", -1001, "Café Central", 0));
    expect(h).not.toBe(dedupHash("a1", "2024-01-10", -1000, "Café Central", 1));
  });
});

describe("planImport: transfers", () => {
  const counterpart = (over: Partial<ExistingTx> = {}) =>
    tx({
      id: "o1",
      accountId: "a2",
      amount: 50000,
      kind: "income",
      descriptionRaw: "TRF DE CONTA",
      ...over,
    });

  it("auto-links a unique, hinted, same-day opposite amount", () => {
    const p = plan(
      [row({ amount: -50000, description: "TRANSFERENCIA PARA POUPANCA" })],
      [],
      [counterpart()],
    );
    expect(p.transfers).toEqual([{ rowIndex: 0, counterpartId: "o1", confidence: 1, auto: true }]);
  });
  it("only suggests when there is no hint", () => {
    const p = plan(
      [row({ amount: -50000, description: "X" })],
      [],
      [counterpart({ descriptionRaw: "Y" })],
    );
    expect(p.transfers[0]?.auto).toBe(false);
    expect(p.transfers[0]?.confidence).toBeLessThan(0.9);
  });
  it("never auto-links when two counterparts fit, and respects window and currency", () => {
    const two = plan(
      [row({ amount: -50000, description: "TRF" })],
      [],
      [counterpart(), counterpart({ id: "o2" })],
    );
    expect(two.transfers.every((t) => !t.auto)).toBe(true);
    expect(
      plan([row({ amount: -50000 })], [], [counterpart({ bookingDate: "2024-01-20" })]).transfers,
    ).toEqual([]);
    expect(
      plan([row({ amount: -50000 })], [], [counterpart({ currency: "USD" })]).transfers,
    ).toEqual([]);
    expect(
      plan([row({ amount: -50000 })], [], [counterpart({ kind: "transfer" })]).transfers,
    ).toEqual([]);
  });
  it("ignores duplicates already in the database", () => {
    const first = plan([row({ amount: -50000 })]);
    const stored = [tx({ id: "s0", amount: -50000, dedupHash: first.rows[0]?.dedupHash ?? "" })];
    expect(plan([row({ amount: -50000 })], stored, [counterpart()]).transfers).toEqual([]);
  });
});

describe("lookupRange", () => {
  it("widens the file's range by the matching window", () => {
    expect(lookupRange([{ bookingDate: "2024-01-10" }, { bookingDate: "2024-01-03" }])).toEqual({
      from: "2023-12-29",
      to: "2024-01-15",
    });
    expect(lookupRange([])).toBeNull();
  });
});
