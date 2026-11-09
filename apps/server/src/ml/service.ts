import { gunzipSync, gzipSync } from "node:zlib";
import {
  deserializeModel,
  evaluateModel,
  MIN_EXAMPLES,
  type MlExample,
  type Model,
  type ModelMetrics,
  serializeModel,
  splitHeldOut,
  trainModel,
} from "@wallt/categorize";
import type { Db } from "../database";
import { uuidv7 } from "../ids";
import type { Logger } from "../logger";
import type { createScheduler } from "../scheduler";

/*
 * Local category classifier on the server (PLAN §6 step 3, ADR 0009). The server trains from the user's own
 * categorised transactions (the rows sync already delivered), keeps versions in `ml_models`, promotes a new model
 * only if it does not lose accuracy against the active one on the same held-out rows, and serves the active model
 * to devices, which score locally. The server never writes synced rows: ML suggestions reach the data through the
 * device's normal writes, so sync's conflict rules (user beats ML) are untouched.
 */

export const ML_NIGHTLY_JOB = "ml-train";
export const ML_CHECK_JOB = "ml-train-check";
/** 03:30 server time. */
export const ML_NIGHTLY_SCHEDULE = "30 3 * * *";
/** Every 15 minutes: retrains a user once enough corrections piled up. */
export const ML_CHECK_SCHEDULE = "*/15 * * * *";
/** Retrain after this many new or changed user-categorised transactions (PLAN §6). */
export const RETRAIN_AFTER = 20;
/** A new model may score this much lower than the active one on the same held-out rows and still be promoted. */
export const ACCURACY_TOLERANCE = 0.01;
/** Versions kept besides the active one (the previous active is the rollback target). */
const KEEP_VERSIONS = 5;

export interface StoredMetrics extends ModelMetrics {
  /** Highest `server_seq` among the labelled rows this model saw: later changes are "new". */
  seq: number;
  trainedOn: number;
  classes: number;
  /** Accuracy of the previously active model on the same held-out rows, when there was one. */
  previousAccuracy: number | null;
  /** Why a trained model was not promoted. */
  rejected?: string;
}

export type TrainResult =
  | { status: "trained"; version: number; metrics: StoredMetrics }
  | { status: "rejected"; version: number; metrics: StoredMetrics }
  | { status: "skipped"; reason: "too_little_data" | "no_changes" | "single_category" };

interface ModelRow {
  id: string;
  version: number;
  created_at: string;
  model: Buffer;
  metrics: string;
  trained_on_count: number;
  active: number;
}

export interface ModelInfo {
  version: number;
  createdAt: string;
  trainedOnCount: number;
  metrics: StoredMetrics;
}

const infoOf = (r: Omit<ModelRow, "model">): ModelInfo => ({
  version: r.version,
  createdAt: r.created_at,
  trainedOnCount: r.trained_on_count,
  metrics: JSON.parse(r.metrics) as StoredMetrics,
});

export function createMlService(opts: {
  db: Db;
  log: Logger;
  clock?: () => number;
  /** Accuracy a new model may lose against the active one and still be promoted. */
  tolerance?: number;
}) {
  const { db, log } = opts;
  const tolerance = opts.tolerance ?? ACCURACY_TOLERANCE;
  const now = opts.clock ?? Date.now;
  let training = false;

  const labelled = db.prepare(
    `SELECT t.id, t.account_id, t.amount, t.booking_date, t.payee, t.description_raw, t.description_clean,
            t.category_id, t.server_seq
       FROM transactions t
       JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
      WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.kind != 'transfer'
        AND t.category_id IS NOT NULL AND t.categorization_method = 'user'`,
  );
  const changedSince = db.prepare(
    `SELECT count(*) AS n
       FROM transactions t
       JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
      WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.kind != 'transfer'
        AND t.category_id IS NOT NULL AND t.categorization_method = 'user' AND t.server_seq > ?`,
  );
  const latestRow = db.prepare(
    "SELECT id, version, created_at, metrics, trained_on_count, active FROM ml_models WHERE user_id = ? ORDER BY version DESC LIMIT 1",
  );
  const activeRow = db.prepare(
    "SELECT id, version, created_at, model, metrics, trained_on_count, active FROM ml_models WHERE user_id = ? AND active = 1",
  );
  const insertModel = db.prepare(
    "INSERT INTO ml_models (id, user_id, version, created_at, model, metrics, trained_on_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  type LabelRow = {
    id: string;
    account_id: string;
    amount: number;
    booking_date: string;
    payee: string;
    description_raw: string;
    description_clean: string;
    category_id: string;
    server_seq: number | null;
  };

  const exampleOf = (r: LabelRow): MlExample => ({
    id: r.id,
    payee: r.payee,
    description: r.description_clean || r.description_raw,
    descriptionRaw: r.description_raw,
    amount: r.amount,
    accountId: r.account_id,
    bookingDate: r.booking_date,
    categoryId: r.category_id,
  });

  function loadModel(row: ModelRow): Model | null {
    return deserializeModel(gunzipSync(row.model).toString("utf8"));
  }

  function prune(userId: string): void {
    const keep = db
      .prepare(
        "SELECT version FROM ml_models WHERE user_id = ? ORDER BY active DESC, version DESC LIMIT ?",
      )
      .all(userId, KEEP_VERSIONS + 1) as { version: number }[];
    if (keep.length < KEEP_VERSIONS + 1) return;
    const min = Math.min(...keep.map((k) => k.version));
    db.prepare("DELETE FROM ml_models WHERE user_id = ? AND version < ? AND active = 0").run(
      userId,
      min,
    );
  }

  const service = {
    /**
     * Trains a model for one user. Without `force`, does nothing unless something changed since the newest model.
     * Runs in-process (a few seconds at 50k rows): scheduled for the night, or after `RETRAIN_AFTER` corrections.
     */
    train(userId: string, options: { force?: boolean } = {}): TrainResult {
      const rows = labelled.all(userId) as LabelRow[];
      if (rows.length < MIN_EXAMPLES) return { status: "skipped", reason: "too_little_data" };
      const seq = rows.reduce((m, r) => Math.max(m, r.server_seq ?? 0), 0);
      const latest = latestRow.get(userId) as Omit<ModelRow, "model"> | undefined;
      if (!options.force && latest && (JSON.parse(latest.metrics) as StoredMetrics).seq >= seq) {
        return { status: "skipped", reason: "no_changes" };
      }

      const examples = rows.map(exampleOf);
      const { train, heldOut } = splitHeldOut(examples, 0.2);
      const fit = splitHeldOut(train, 0.1);
      const model = trainModel(fit.train, fit.heldOut);
      if (!model) return { status: "skipped", reason: "single_category" };

      const metrics = evaluateModel(model, heldOut);
      const active = activeRow.get(userId) as ModelRow | undefined;
      const previous = active ? loadModel(active) : null;
      const previousAccuracy = previous ? evaluateModel(previous, heldOut).accuracy : null;
      const rejected =
        previousAccuracy !== null && metrics.accuracy < previousAccuracy - tolerance
          ? `accuracy ${(metrics.accuracy * 100).toFixed(1)}% is below the active model's ${(previousAccuracy * 100).toFixed(1)}%`
          : undefined;

      const stored: StoredMetrics = {
        ...metrics,
        seq,
        trainedOn: fit.train.length,
        classes: model.classes.length,
        previousAccuracy,
        ...(rejected ? { rejected } : {}),
      };
      const version = (latest?.version ?? 0) + 1;
      const blob = gzipSync(Buffer.from(serializeModel(model), "utf8"));
      db.transaction(() => {
        if (!rejected) db.prepare("UPDATE ml_models SET active = 0 WHERE user_id = ?").run(userId);
        insertModel.run(
          uuidv7(),
          userId,
          version,
          new Date(now()).toISOString(),
          blob,
          JSON.stringify(stored),
          examples.length,
          rejected ? 0 : 1,
        );
        prune(userId);
      })();
      log.info(
        { userId, version, accuracy: metrics.accuracy, heldOut: metrics.heldOut, rejected },
        "ml model trained",
      );
      return rejected
        ? { status: "rejected", version, metrics: stored }
        : { status: "trained", version, metrics: stored };
    },

    /** Trains every user that has something new (`minChanges` = 1 nightly, `RETRAIN_AFTER` for the frequent check). */
    trainAll(minChanges: number): Record<string, number> {
      if (training) return { skipped: 1 };
      training = true;
      const counts = { users: 0, trained: 0, rejected: 0, skipped: 0 };
      try {
        const users = db.prepare("SELECT id FROM users").all() as { id: string }[];
        for (const { id } of users) {
          counts.users++;
          const latest = latestRow.get(id) as Omit<ModelRow, "model"> | undefined;
          const since = latest ? (JSON.parse(latest.metrics) as StoredMetrics).seq : 0;
          const changed = (changedSince.get(id, since) as { n: number }).n;
          if (changed < minChanges) {
            counts.skipped++;
            continue;
          }
          const r = service.train(id);
          if (r.status === "trained") counts.trained++;
          else if (r.status === "rejected") counts.rejected++;
          else counts.skipped++;
        }
      } finally {
        training = false;
      }
      return counts;
    },

    /** One training at a time: a manual request while a scheduled run is going answers "busy". */
    trainNow(userId: string): TrainResult | { status: "busy" } {
      if (training) return { status: "busy" };
      training = true;
      try {
        return service.train(userId, { force: true });
      } finally {
        training = false;
      }
    },

    /** The active model as stored JSON text (parsed by the device), or null. */
    activeModel(userId: string): (ModelInfo & { json: string }) | null {
      const row = activeRow.get(userId) as ModelRow | undefined;
      if (!row) return null;
      return { ...infoOf(row), json: gunzipSync(row.model).toString("utf8") };
    },

    status(userId: string): {
      active: ModelInfo | null;
      previous: ModelInfo | null;
      labelled: number;
      newSinceTraining: number;
      minExamples: number;
      retrainAfter: number;
    } {
      const rows = db
        .prepare(
          "SELECT id, version, created_at, metrics, trained_on_count, active FROM ml_models WHERE user_id = ? ORDER BY version DESC",
        )
        .all(userId) as Omit<ModelRow, "model">[];
      const active = rows.find((r) => r.active === 1);
      const previous = rows.find(
        (r) =>
          r.active === 0 &&
          active &&
          r.version < active.version &&
          !(JSON.parse(r.metrics) as StoredMetrics).rejected,
      );
      const latest = rows[0];
      const since = latest ? (JSON.parse(latest.metrics) as StoredMetrics).seq : 0;
      return {
        active: active ? infoOf(active) : null,
        previous: previous ? infoOf(previous) : null,
        labelled: (
          db
            .prepare(
              `SELECT count(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id AND c.deleted_at IS NULL
                WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.kind != 'transfer' AND t.category_id IS NOT NULL AND t.categorization_method = 'user'`,
            )
            .get(userId) as { n: number }
        ).n,
        newSinceTraining: (changedSince.get(userId, since) as { n: number }).n,
        minExamples: MIN_EXAMPLES,
        retrainAfter: RETRAIN_AFTER,
      };
    },

    /** Re-activates the version before the active one (the active one stays stored, inactive). */
    rollback(userId: string): { version: number } | null {
      const active = activeRow.get(userId) as ModelRow | undefined;
      if (!active) return null;
      const target = db
        .prepare(
          "SELECT id, version, metrics FROM ml_models WHERE user_id = ? AND version < ? AND active = 0 ORDER BY version DESC",
        )
        .all(userId, active.version) as { id: string; version: number; metrics: string }[];
      // Rejected versions were never active: they are not rollback targets.
      const previous = target.find((r) => !(JSON.parse(r.metrics) as StoredMetrics).rejected);
      if (!previous) return null;
      db.transaction(() => {
        db.prepare("UPDATE ml_models SET active = 0 WHERE user_id = ?").run(userId);
        db.prepare("UPDATE ml_models SET active = 1 WHERE id = ?").run(previous.id);
      })();
      log.info({ userId, from: active.version, to: previous.version }, "ml model rolled back");
      return { version: previous.version };
    },

    register(scheduler: ReturnType<typeof createScheduler>): void {
      scheduler.register({
        name: ML_NIGHTLY_JOB,
        schedule: ML_NIGHTLY_SCHEDULE,
        run: async () => service.trainAll(1),
      });
      scheduler.register({
        name: ML_CHECK_JOB,
        schedule: ML_CHECK_SCHEDULE,
        run: async () => service.trainAll(RETRAIN_AFTER),
      });
    },
  };
  return service;
}

export type MlService = ReturnType<typeof createMlService>;
