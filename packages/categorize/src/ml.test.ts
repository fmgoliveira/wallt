import { describe, expect, it } from "vitest";
import {
  AUTO_THRESHOLD,
  deserializeModel,
  evaluateModel,
  extractFeatures,
  type MlExample,
  predict,
  serializeModel,
  splitHeldOut,
  trainModel,
} from "./ml";

// Deterministic data: merchants with a category each, noisy bank text around them.
const MERCHANTS: [category: string, payee: string, words: string[], size: number][] = [
  ["groceries", "Pingo Doce", ["PINGO DOCE", "PINGO DOCE LISBOA", "COMPRA PINGO DOCE"], 3000],
  ["groceries", "Lidl", ["LIDL", "LIDL & CIA", "COMPRA LIDL PORTO"], 2000],
  ["fuel", "Galp", ["GALP", "GALP ENERGIA", "POSTO GALP A1"], 5000],
  ["fuel", "Repsol", ["REPSOL", "REPSOL PORTUGAL"], 4500],
  ["rent", "Senhorio", ["TRF SENHORIO RENDA", "RENDA CASA"], 75000],
  ["internet", "MEO", ["MEO SERVICOS", "PAGAMENTO MEO"], 3500],
  ["coffee", "Pastelaria", ["PASTELARIA CENTRAL", "CAFE BRASILEIRA"], 150],
  ["transport", "Uber", ["UBER TRIP", "UBER *TRIP HELP"], 900],
];

function dataset(n: number, seed = 7): MlExample[] {
  let s = seed;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: MlExample[] = [];
  for (let i = 0; i < n; i++) {
    const [categoryId, payee, words, size] = MERCHANTS[
      Math.floor(rand() * MERCHANTS.length)
    ] as (typeof MERCHANTS)[number];
    const text = `${words[Math.floor(rand() * words.length)]} ${Math.floor(rand() * 9000) + 1000}`;
    out.push({
      id: `0190a5c4-7b1e-7a3f-8c2d-${String(i).padStart(12, "0")}`,
      payee,
      description: text,
      amount: -Math.round(size * (0.7 + rand() * 0.6)),
      accountId: "acc-1",
      bookingDate: `2026-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`,
      categoryId,
    });
  }
  return out;
}

describe("features", () => {
  it("are sparse, normalised and ignore the digits of references", () => {
    const f = { payee: "Lidl", description: "COMPRA 1234", amount: -500, accountId: "a" };
    const a = extractFeatures(f);
    const b = extractFeatures({ ...f, description: "COMPRA 9876" });
    expect(a.idx).toEqual(b.idx);
    const norm = a.val.reduce((s, v) => s + v * v, 0);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("differ by sign, weekday and account", () => {
    const base = {
      payee: "X",
      description: "Y",
      amount: -500,
      accountId: "a",
      bookingDate: "2026-11-09",
    };
    const key = (f: typeof base) => extractFeatures(f).idx.slice().sort().join(",");
    expect(key(base)).not.toBe(key({ ...base, amount: 500 }));
    expect(key(base)).not.toBe(key({ ...base, bookingDate: "2026-11-10" }));
    expect(key(base)).not.toBe(key({ ...base, accountId: "b" }));
  });
});

describe("splitHeldOut", () => {
  it("is stable and roughly the requested size", () => {
    const rows = dataset(2000);
    const a = splitHeldOut(rows);
    const b = splitHeldOut([...rows].reverse());
    expect(new Set(a.heldOut.map((r) => r.id))).toEqual(new Set(b.heldOut.map((r) => r.id)));
    expect(a.heldOut.length).toBeGreaterThan(300);
    expect(a.heldOut.length).toBeLessThan(500);
    expect(a.train.length + a.heldOut.length).toBe(rows.length);
  });
});

describe("trainModel", () => {
  const rows = dataset(2400);
  const { train, heldOut } = splitHeldOut(rows);
  const calibrationSplit = splitHeldOut(train, 0.1);
  const model = trainModel(calibrationSplit.train, calibrationSplit.heldOut);

  it("learns to categorise merchants it has seen", () => {
    expect(model).not.toBeNull();
    const metrics = evaluateModel(model as NonNullable<typeof model>, heldOut);
    expect(metrics.accuracy).toBeGreaterThan(0.9);
    expect(metrics.autoCoverage).toBeGreaterThan(0.5);
    expect(metrics.autoPrecision).toBeGreaterThan(0.95);
  });

  it("returns calibrated probabilities that sum to at most 1 and rank the right class first", () => {
    const m = model as NonNullable<typeof model>;
    const top = predict(
      m,
      { payee: "Galp", description: "GALP ENERGIA 5521", amount: -5200, accountId: "acc-1" },
      3,
    );
    expect(top[0]?.categoryId).toBe("fuel");
    expect(top.reduce((s, p) => s + p.probability, 0)).toBeLessThanOrEqual(1.0000001);
    expect(top[0]?.probability).toBeGreaterThan(AUTO_THRESHOLD);
  });

  it("is unsure about text it has never seen", () => {
    const m = model as NonNullable<typeof model>;
    const top = predict(
      m,
      { payee: "Zxqv", description: "QWJKL ZZZZ", amount: -123, accountId: "other" },
      1,
    );
    expect(top[0]?.probability).toBeLessThan(AUTO_THRESHOLD);
  });

  it("is deterministic and survives serialisation", () => {
    const again = trainModel(calibrationSplit.train, calibrationSplit.heldOut);
    expect(serializeModel(again as never)).toBe(serializeModel(model as never));
    const back = deserializeModel(serializeModel(model as never));
    expect(back).not.toBeNull();
    const f = { payee: "Lidl", description: "LIDL & CIA 1234", amount: -2100, accountId: "acc-1" };
    expect(predict(back as never, f)).toEqual(predict(model as never, f));
  });

  it("refuses too little data or a single category", () => {
    expect(trainModel(dataset(20))).toBeNull();
    const oneClass = dataset(400).map((r) => ({ ...r, categoryId: "same" }));
    expect(trainModel(oneClass)).toBeNull();
  });
});

describe("deserializeModel", () => {
  it("rejects anything that is not a model of this version", () => {
    expect(deserializeModel("not json")).toBeNull();
    expect(deserializeModel("{}")).toBeNull();
    expect(
      deserializeModel(
        JSON.stringify({
          version: 2,
          dim: 4,
          classes: ["a", "b"],
          bias: [0, 0],
          weights: {},
          temperature: 1,
        }),
      ),
    ).toBeNull();
    expect(
      deserializeModel(
        JSON.stringify({
          version: 1,
          dim: 4,
          classes: ["a", "b"],
          bias: [0],
          weights: {},
          temperature: 1,
        }),
      ),
    ).toBeNull();
  });
});
