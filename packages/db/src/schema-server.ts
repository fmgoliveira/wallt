import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Server-only tables (never synced to devices). Unlike synced tables these use real foreign keys
 * (the server runs with `foreign_keys=ON`). Secrets are stored as ciphertext/hashes produced by the
 * server (ENCRYPTION_KEY, argon2id, sha256); this package only stores the text.
 */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    /** argon2id encoded hash */
    passwordHash: text("password_hash").notNull(),
    /** TOTP secret encrypted with ENCRYPTION_KEY; null until 2FA enrolment starts */
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: text("totp_enabled_at"),
    /** JSON array of { hash: string, usedAt: string | null } */
    recoveryCodes: text("recovery_codes").notNull().default("[]"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    /** Highest `server_seq` this device has told us it applied (its pull cursor); the purge of deleted rows waits on it. */
    lastPullSeq: integer("last_pull_seq"),
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    /** sha256 of the opaque token; the token itself is never stored */
    tokenHash: text("token_hash").notNull(),
    /** rotation family; reuse of a revoked token revokes the whole family */
    familyId: text("family_id").notNull(),
    replacedById: text("replaced_by_id"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_idx").on(t.tokenHash),
    index("refresh_tokens_device_idx").on(t.deviceId),
    index("refresh_tokens_family_idx").on(t.familyId),
  ],
);

export const mlModels = sqliteTable(
  "ml_models",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    /** serialized classifier weights */
    model: blob("model", { mode: "buffer" }).notNull(),
    /** JSON: { accuracy, heldOut, ... } */
    metrics: text("metrics").notNull(),
    trainedOnCount: integer("trained_on_count").notNull(),
    /** exactly one active model per user (previous kept for rollback) */
    active: integer("active", { mode: "boolean" }).notNull(),
  },
  (t) => [uniqueIndex("ml_models_user_version_idx").on(t.userId, t.version)],
);

export const backupRuns = sqliteTable(
  "backup_runs",
  {
    id: text("id").primaryKey(),
    /** scheduled | manual | pre_migration */
    trigger: text("trigger").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    /** running | success | failed */
    status: text("status").notNull(),
    sizeBytes: integer("size_bytes"),
    driveFileId: text("drive_file_id"),
    error: text("error"),
  },
  (t) => [index("backup_runs_started_idx").on(t.startedAt)],
);

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    job: text("job").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    /** running | success | failed */
    status: text("status").notNull(),
    /** JSON counts, e.g. { fetched, inserted, duplicates } */
    counts: text("counts"),
    error: text("error"),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
);
