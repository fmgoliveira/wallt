import type { TxFacts } from "./rules";
import { normalizeText } from "./text";

/*
 * Local classifier (PLAN §6 step 3, ADR 0009): multinomial logistic regression over hashed features, trained with
 * AdaGrad on the user's own categorised transactions, temperature-calibrated on held-out rows. Pure and
 * deterministic (seeded shuffle, stable held-out split), so the same data always yields the same model.
 *
 * Features (hashed into `dim` buckets, L2-normalised): word tokens and character 3-5-grams of payee + description
 * (digit runs collapsed), amount magnitude (log2 bucket), sign, account, weekday.
 */

export interface MlFacts extends TxFacts {
  /** `YYYY-MM-DD`; gives the weekday feature when present. */
  bookingDate?: string | undefined;
}

export interface MlExample extends MlFacts {
  id: string;
  categoryId: string;
}

export interface Model {
  version: 1;
  dim: number;
  /** Category id per class index. */
  classes: string[];
  bias: number[];
  /** Feature bucket -> `[class, weight, class, weight, ...]` for the weights that matter. */
  weights: Record<string, number[]>;
  /** Divides the logits before the softmax; fitted so probabilities match observed accuracy. */
  temperature: number;
}

export interface Prediction {
  categoryId: string;
  /** Calibrated probability, 0..1. */
  probability: number;
}

export interface TrainOptions {
  dim?: number;
  epochs?: number;
  learningRate?: number;
  l2?: number;
  seed?: number;
}

export interface ModelMetrics {
  /** Share of held-out rows whose top prediction is right. */
  accuracy: number;
  /** Held-out rows evaluated. */
  heldOut: number;
  /** Share of held-out rows predicted with probability >= `AUTO_THRESHOLD`. */
  autoCoverage: number;
  /** Accuracy among those auto-assigned rows (the number that matters for trust). */
  autoPrecision: number;
}

/** Probability from which a prediction is assigned without review (PLAN §6.5). */
export const AUTO_THRESHOLD = 0.85;
/** Below this the transaction stays uncategorised. */
export const SUGGEST_THRESHOLD = 0.5;
export const MIN_EXAMPLES = 60;
const DEFAULT_DIM = 1 << 14;

/* ----------------------------------------------------------------- features */

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const weekday = (date: string | undefined): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() : null;
};

/** Sparse, L2-normalised feature vector of a transaction. */
export function extractFeatures(
  f: MlFacts,
  dim: number = DEFAULT_DIM,
): { idx: number[]; val: number[] } {
  const keys = new Set<string>();
  const text = normalizeText(`${f.payee} ${f.description}`).replace(/\d+/g, "#").slice(0, 160);
  for (const word of text.split(" ")) {
    if (word.length < 2 && word !== "#") continue;
    keys.add(`w:${word}`);
    const padded = ` ${word} `;
    for (let n = 3; n <= 5; n++) {
      for (let i = 0; i + n <= padded.length; i++) keys.add(`c${n}:${padded.slice(i, i + n)}`);
    }
  }
  keys.add(`a:${Math.floor(Math.log2(Math.abs(f.amount) + 1))}`);
  keys.add(`s:${f.amount < 0 ? "-" : "+"}`);
  keys.add(`acc:${f.accountId}`);
  const day = weekday(f.bookingDate);
  if (day !== null) keys.add(`d:${day}`);

  const counts = new Map<number, number>();
  for (const k of keys) {
    const i = fnv1a(k) % dim;
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  let norm = 0;
  for (const v of counts.values()) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  const idx: number[] = [];
  const val: number[] = [];
  for (const [i, v] of counts) {
    idx.push(i);
    val.push(v / norm);
  }
  return { idx, val };
}

/* ---------------------------------------------------------------- held-out */

/** Stable split by a hash of the id, so a row stays on the same side across retrains. */
export function splitHeldOut<T extends { id: string }>(
  examples: readonly T[],
  fraction = 0.2,
): { train: T[]; heldOut: T[] } {
  const train: T[] = [];
  const heldOut: T[] = [];
  const cut = Math.round(fraction * 1000);
  for (const e of examples) (fnv1a(`split:${e.id}`) % 1000 < cut ? heldOut : train).push(e);
  return { train, heldOut };
}

/* --------------------------------------------------------------------- math */

function softmax(logits: number[]): number[] {
  let max = Number.NEGATIVE_INFINITY;
  for (const l of logits) if (l > max) max = l;
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return exp.map((e) => e / sum);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ predict */

function logitsOf(model: Model, f: MlFacts): number[] {
  const { idx, val } = extractFeatures(f, model.dim);
  const z = [...model.bias];
  for (let n = 0; n < idx.length; n++) {
    const entry = model.weights[String(idx[n])];
    if (!entry) continue;
    const v = val[n] as number;
    for (let j = 0; j < entry.length; j += 2) {
      const c = entry[j] as number;
      z[c] = (z[c] as number) + v * (entry[j + 1] as number);
    }
  }
  return z;
}

/** The `top` most likely categories with calibrated probabilities, best first. */
export function predict(model: Model, f: MlFacts, top = 3): Prediction[] {
  const p = softmax(logitsOf(model, f).map((z) => z / model.temperature));
  return p
    .map((probability, c) => ({ categoryId: model.classes[c] as string, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, top);
}

export function evaluateModel(model: Model, examples: readonly MlExample[]): ModelMetrics {
  let right = 0;
  let auto = 0;
  let autoRight = 0;
  for (const e of examples) {
    const best = predict(model, e, 1)[0];
    if (!best) continue;
    const hit = best.categoryId === e.categoryId;
    if (hit) right++;
    if (best.probability >= AUTO_THRESHOLD) {
      auto++;
      if (hit) autoRight++;
    }
  }
  const n = examples.length;
  return {
    accuracy: n ? right / n : 0,
    heldOut: n,
    autoCoverage: n ? auto / n : 0,
    autoPrecision: auto ? autoRight / auto : 0,
  };
}

/* -------------------------------------------------------------------- train */

/** Negative log-likelihood of the examples at a given temperature (lower is better). */
function nll(model: Model, examples: readonly MlExample[], temperature: number): number {
  const index = new Map(model.classes.map((c, i) => [c, i] as const));
  let total = 0;
  let n = 0;
  for (const e of examples) {
    const target = index.get(e.categoryId);
    if (target === undefined) continue;
    const p = softmax(logitsOf(model, e).map((z) => z / temperature))[target] as number;
    total -= Math.log(Math.max(p, 1e-12));
    n++;
  }
  return n ? total / n : 0;
}

/**
 * Train on `examples`; `calibration` (held out from training) only fits the temperature. Returns `null` when there is
 * too little data or fewer than two categories to tell apart.
 */
export function trainModel(
  examples: readonly MlExample[],
  calibration: readonly MlExample[] = [],
  options: TrainOptions = {},
): Model | null {
  const dim = options.dim ?? DEFAULT_DIM;
  const epochs = options.epochs ?? 10;
  const lr = options.learningRate ?? 0.4;
  const l2 = options.l2 ?? 1e-6;
  if (examples.length < MIN_EXAMPLES) return null;

  const counts = new Map<string, number>();
  for (const e of examples) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
  // A class seen once cannot be validated; leave it to rules and the user.
  const classes = [...counts]
    .filter(([, n]) => n >= 2)
    .map(([c]) => c)
    .sort();
  if (classes.length < 2) return null;
  const index = new Map(classes.map((c, i) => [c, i] as const));
  const K = classes.length;

  const data = examples
    .filter((e) => index.has(e.categoryId))
    .map((e) => ({ ...extractFeatures(e, dim), y: index.get(e.categoryId) as number }));
  if (data.length < MIN_EXAMPLES) return null;

  const w = new Float64Array(K * dim);
  const g = new Float64Array(K * dim).fill(1e-8);
  const b = new Float64Array(K);
  const gb = new Float64Array(K).fill(1e-8);
  const order = data.map((_, i) => i);
  const rand = mulberry32(options.seed ?? 1);
  const z = new Array<number>(K).fill(0);

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j] as number, order[i] as number];
    }
    for (const o of order) {
      const { idx, val, y } = data[o] as (typeof data)[number];
      for (let c = 0; c < K; c++) z[c] = b[c] as number;
      for (let n = 0; n < idx.length; n++) {
        const base = idx[n] as number;
        const v = val[n] as number;
        for (let c = 0; c < K; c++) z[c] = (z[c] as number) + v * (w[c * dim + base] as number);
      }
      const p = softmax(z);
      for (let c = 0; c < K; c++) {
        const err = (p[c] as number) - (c === y ? 1 : 0);
        gb[c] = (gb[c] as number) + err * err;
        b[c] = (b[c] as number) - (lr * err) / Math.sqrt(gb[c] as number);
        // A class that is already (almost) right or (almost) absent has nothing to teach: skip its weights.
        if (Math.abs(err) < 1e-3) continue;
        for (let n = 0; n < idx.length; n++) {
          const at = c * dim + (idx[n] as number);
          const grad = err * (val[n] as number) + l2 * (w[at] as number);
          g[at] = (g[at] as number) + grad * grad;
          w[at] = (w[at] as number) - (lr * grad) / Math.sqrt(g[at] as number);
        }
      }
    }
  }

  const weights: Record<string, number[]> = {};
  for (let f = 0; f < dim; f++) {
    const entry: number[] = [];
    for (let c = 0; c < K; c++) {
      const v = Math.round((w[c * dim + f] as number) * 1000) / 1000;
      if (Math.abs(v) >= 0.005) entry.push(c, v);
    }
    if (entry.length > 0) weights[String(f)] = entry;
  }
  const model: Model = {
    version: 1,
    dim,
    classes,
    bias: Array.from(b, (v) => Math.round(v * 1000) / 1000),
    weights,
    temperature: 1,
  };
  if (calibration.length > 0) model.temperature = fitTemperature(model, calibration);
  return model;
}

function fitTemperature(model: Model, calibration: readonly MlExample[]): number {
  let best = 1;
  let bestLoss = nll(model, calibration, 1);
  for (let t = 0.25; t <= 4.001; t += 0.05) {
    const loss = nll(model, calibration, t);
    if (loss < bestLoss - 1e-9) {
      best = t;
      bestLoss = loss;
    }
  }
  return Math.round(best * 100) / 100;
}

/* ------------------------------------------------------------ serialisation */

export const serializeModel = (model: Model): string => JSON.stringify(model);

/** Parse and validate a stored model; `null` when it is not one this version understands. */
export function deserializeModel(text: string): Model | null {
  try {
    const m = JSON.parse(text) as Partial<Model>;
    if (
      m.version !== 1 ||
      typeof m.dim !== "number" ||
      !Array.isArray(m.classes) ||
      m.classes.length < 2 ||
      !m.classes.every((c) => typeof c === "string") ||
      !Array.isArray(m.bias) ||
      m.bias.length !== m.classes.length ||
      typeof m.temperature !== "number" ||
      !(m.temperature > 0) ||
      typeof m.weights !== "object" ||
      m.weights === null
    ) {
      return null;
    }
    return m as Model;
  } catch {
    return null;
  }
}
