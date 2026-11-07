import type { Db } from "../database";
import { uuidv7 } from "../ids";
import type { Logger } from "../logger";
import {
  decrypt,
  dummyHash,
  encrypt,
  hashPassword,
  type Keys,
  randomToken,
  safeEqual,
  sha256Hex,
  verifyPassword,
} from "./crypto";
import { signToken, verifyToken } from "./jwt";
import { base32Encode, generateSecret, otpauthUri, verifyTotp } from "./totp";

export const ACCESS_TTL_S = 15 * 60;
export const MFA_TTL_S = 5 * 60;
export const ENROL_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;

export class AuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 409 | 429,
    readonly code: string,
    readonly retryAfterSec?: number,
  ) {
    super(code);
  }
}

export type AuthDeps = {
  db: Db;
  log: Logger;
  keys: Keys;
  /** One-time guard for POST /auth/setup; setup is disabled when unset. */
  setupToken?: string | undefined;
  issuer?: string;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
};

export type DeviceInput = { id?: string | undefined; name: string; platform: string };

export type Session = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  deviceId: string;
};

export type Enrolment = {
  status: "enrol_required";
  enrolToken: string;
  otpauthUri: string;
  secret: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  totp_secret_enc: string | null;
  totp_enabled_at: string | null;
  recovery_codes: string;
  locked_until: string | null;
};

type RecoveryCode = { hash: string; usedAt: string | null };

const iso = (ms: number) => new Date(ms).toISOString();
const normalizeRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function createAuthService({
  db,
  log,
  keys,
  setupToken,
  issuer = "Wallt",
  now = Date.now,
}: AuthDeps) {
  /** Last accepted TOTP step per user: a code can be used once (RFC 6238 section 5.2). */
  const lastTotpStep = new Map<string, number>();

  const userById = (id: string) =>
    db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  const userByEmail = (email: string) =>
    db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  const userCount = () => (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

  function assertNotLocked(user: UserRow): void {
    const until = user.locked_until ? Date.parse(user.locked_until) : 0;
    if (until > now()) throw new AuthError(429, "locked", Math.ceil((until - now()) / 1000));
  }

  /** Counts a failed password/second-factor attempt; locks the account after MAX_FAILURES. */
  function registerFailure(userId: string): void {
    db.prepare("UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?").run(userId);
    const row = db.prepare("SELECT failed_attempts AS n FROM users WHERE id = ?").get(userId) as {
      n: number;
    };
    if (row.n >= MAX_FAILURES) {
      db.prepare("UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?").run(
        iso(now() + LOCK_MS),
        userId,
      );
      log.warn({ userId }, "account locked after repeated failures");
    }
  }

  function clearFailures(userId: string): void {
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(
      userId,
    );
  }

  function beginEnrolment(user: UserRow): Enrolment {
    const secret = generateSecret();
    db.prepare("UPDATE users SET totp_secret_enc = ?, updated_at = ? WHERE id = ?").run(
      encrypt(keys.encKey, secret),
      iso(now()),
      user.id,
    );
    return {
      status: "enrol_required",
      enrolToken: signToken(keys.jwtKey, { sub: user.id, scp: "enrol" }, ENROL_TTL_S, now()),
      otpauthUri: otpauthUri(issuer, user.email, secret),
      secret,
    };
  }

  function newRefreshToken(userId: string, deviceId: string, familyId: string): string {
    const raw = randomToken(32);
    db.prepare(
      "INSERT INTO refresh_tokens (id, user_id, device_id, token_hash, family_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      uuidv7(now()),
      userId,
      deviceId,
      sha256Hex(raw),
      familyId,
      iso(now()),
      iso(now() + REFRESH_TTL_MS),
    );
    return raw;
  }

  function accessToken(userId: string, deviceId: string): string {
    return signToken(
      keys.jwtKey,
      { sub: userId, scp: "access", did: deviceId },
      ACCESS_TTL_S,
      now(),
    );
  }

  function issueSession(userId: string, device: DeviceInput): Session {
    return db.transaction((): Session => {
      const t = iso(now());
      const known = device.id
        ? db
            .prepare("SELECT id FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
            .get(device.id, userId)
        : undefined;
      let deviceId = device.id as string;
      if (known) {
        db.prepare("UPDATE devices SET name = ?, platform = ?, last_seen_at = ? WHERE id = ?").run(
          device.name,
          device.platform,
          t,
          deviceId,
        );
      } else {
        deviceId = uuidv7(now());
        db.prepare(
          "INSERT INTO devices (id, user_id, name, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(deviceId, userId, device.name, device.platform, t, t);
      }
      return {
        accessToken: accessToken(userId, deviceId),
        refreshToken: newRefreshToken(userId, deviceId, uuidv7(now())),
        tokenType: "Bearer",
        expiresIn: ACCESS_TTL_S,
        deviceId,
      };
    })();
  }

  function consumeRecoveryCode(user: UserRow, input: string): boolean {
    const codes = JSON.parse(user.recovery_codes) as RecoveryCode[];
    const hash = sha256Hex(normalizeRecovery(input));
    let found = -1;
    codes.forEach((c, i) => {
      if (safeEqual(c.hash, hash) && c.usedAt === null && found < 0) found = i;
    });
    if (found < 0) return false;
    (codes[found] as RecoveryCode).usedAt = iso(now());
    db.prepare("UPDATE users SET recovery_codes = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(codes),
      iso(now()),
      user.id,
    );
    return true;
  }

  /** Checks a TOTP code against `secret`; rejects a step that was already used. */
  function checkTotp(userId: string, secret: string, code: string): boolean {
    const step = verifyTotp(secret, code, now());
    if (step === null || step <= (lastTotpStep.get(userId) ?? -1)) return false;
    lastTotpStep.set(userId, step);
    return true;
  }

  return {
    /** First-user setup. Guarded by SETUP_TOKEN and closed for good once a user exists. */
    async setup(input: {
      setupToken: string;
      email: string;
      password: string;
    }): Promise<Enrolment> {
      if (!setupToken) throw new AuthError(403, "setup_disabled");
      if (!safeEqual(input.setupToken, setupToken)) throw new AuthError(403, "invalid_setup_token");
      if (userCount() > 0) throw new AuthError(409, "setup_closed");
      const passwordHash = await hashPassword(input.password);
      if (userCount() > 0) throw new AuthError(409, "setup_closed"); // lost a race while hashing
      const id = uuidv7(now());
      const t = iso(now());
      db.prepare(
        "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(id, input.email, passwordHash, t, t);
      log.info({ userId: id }, "first user created; awaiting 2FA enrolment");
      return beginEnrolment(userById(id) as UserRow);
    },

    /** Step 1: password. Never reveals whether the account exists. */
    async login(input: {
      email: string;
      password: string;
    }): Promise<Enrolment | { status: "mfa_required"; challengeToken: string }> {
      const user = userByEmail(input.email);
      if (user) assertNotLocked(user);
      const ok = await verifyPassword(
        input.password,
        user ? user.password_hash : await dummyHash(),
      );
      if (!user || !ok) {
        if (user) registerFailure(user.id);
        throw new AuthError(401, "invalid_credentials");
      }
      // Failure counters are only cleared after the full 2FA step, never by the password alone.
      if (!user.totp_enabled_at) return beginEnrolment(user);
      return {
        status: "mfa_required",
        challengeToken: signToken(keys.jwtKey, { sub: user.id, scp: "mfa" }, MFA_TTL_S, now()),
      };
    },

    /** Step 2: TOTP code or a single-use recovery code. */
    verifyMfa(input: {
      challengeToken: string;
      code?: string | undefined;
      recoveryCode?: string | undefined;
      device: DeviceInput;
    }): Session {
      const claims = verifyToken(keys.jwtKey, input.challengeToken, "mfa", now());
      const user = claims ? userById(claims.sub) : undefined;
      if (!user?.totp_enabled_at || !user.totp_secret_enc)
        throw new AuthError(401, "invalid_token");
      assertNotLocked(user);
      const ok = input.code
        ? checkTotp(user.id, decrypt(keys.encKey, user.totp_secret_enc), input.code)
        : input.recoveryCode
          ? consumeRecoveryCode(user, input.recoveryCode)
          : false;
      if (!ok) {
        registerFailure(user.id);
        throw new AuthError(401, "invalid_code");
      }
      clearFailures(user.id);
      return issueSession(user.id, input.device);
    },

    /** Finishes 2FA enrolment: activates TOTP, returns recovery codes (shown once) and a session. */
    confirmEnrolment(input: {
      enrolToken: string;
      code: string;
      device: DeviceInput;
    }): Session & { recoveryCodes: string[] } {
      const claims = verifyToken(keys.jwtKey, input.enrolToken, "enrol", now());
      const user = claims ? userById(claims.sub) : undefined;
      if (!user?.totp_secret_enc) throw new AuthError(401, "invalid_token");
      if (user.totp_enabled_at) throw new AuthError(409, "already_enrolled");
      assertNotLocked(user);
      if (!checkTotp(user.id, decrypt(keys.encKey, user.totp_secret_enc), input.code)) {
        registerFailure(user.id);
        throw new AuthError(401, "invalid_code");
      }
      const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
        const c = base32Encode(crypto.getRandomValues(new Uint8Array(7))).slice(0, 10);
        return `${c.slice(0, 5)}-${c.slice(5)}`;
      });
      const stored: RecoveryCode[] = plain.map((c) => ({
        hash: sha256Hex(normalizeRecovery(c)),
        usedAt: null,
      }));
      db.prepare(
        "UPDATE users SET totp_enabled_at = ?, recovery_codes = ?, updated_at = ? WHERE id = ?",
      ).run(iso(now()), JSON.stringify(stored), iso(now()), user.id);
      clearFailures(user.id);
      log.info({ userId: user.id }, "2FA enrolled");
      return { ...issueSession(user.id, input.device), recoveryCodes: plain };
    },

    /** Rotates a refresh token. Presenting an already-rotated token revokes its whole family. */
    refresh(rawToken: string): Session {
      const row = db
        .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
        .get(sha256Hex(rawToken)) as
        | {
            id: string;
            user_id: string;
            device_id: string;
            family_id: string;
            replaced_by_id: string | null;
            expires_at: string;
            revoked_at: string | null;
          }
        | undefined;
      if (!row) throw new AuthError(401, "invalid_token");
      if (row.revoked_at || row.replaced_by_id) {
        db.prepare(
          "UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL",
        ).run(iso(now()), row.family_id);
        log.warn(
          { userId: row.user_id, deviceId: row.device_id },
          "refresh token reuse detected; family revoked",
        );
        throw new AuthError(401, "invalid_token");
      }
      if (Date.parse(row.expires_at) <= now()) throw new AuthError(401, "token_expired");
      const device = db.prepare("SELECT revoked_at FROM devices WHERE id = ?").get(row.device_id) as
        | { revoked_at: string | null }
        | undefined;
      if (!device || device.revoked_at) throw new AuthError(401, "invalid_token");
      return db.transaction((): Session => {
        const next = newRefreshToken(row.user_id, row.device_id, row.family_id);
        const nextId = (
          db.prepare("SELECT id FROM refresh_tokens WHERE token_hash = ?").get(sha256Hex(next)) as {
            id: string;
          }
        ).id;
        db.prepare("UPDATE refresh_tokens SET revoked_at = ?, replaced_by_id = ? WHERE id = ?").run(
          iso(now()),
          nextId,
          row.id,
        );
        db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(
          iso(now()),
          row.device_id,
        );
        return {
          accessToken: accessToken(row.user_id, row.device_id),
          refreshToken: next,
          tokenType: "Bearer",
          expiresIn: ACCESS_TTL_S,
          deviceId: row.device_id,
        };
      })();
    },

    /** Revokes a device and all its refresh tokens. Returns false if it is not this user's active device. */
    revokeDevice(userId: string, deviceId: string): boolean {
      return db.transaction(() => {
        const r = db
          .prepare(
            "UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
          )
          .run(iso(now()), deviceId, userId);
        db.prepare(
          "UPDATE refresh_tokens SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL",
        ).run(iso(now()), deviceId);
        return r.changes > 0;
      })();
    },

    /** Validates a Bearer access token and that its device was not revoked. */
    authenticate(token: string): { userId: string; deviceId: string } | null {
      const claims = verifyToken(keys.jwtKey, token, "access", now());
      if (!claims?.did) return null;
      const ok = db
        .prepare("SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
        .get(claims.did, claims.sub);
      return ok ? { userId: claims.sub, deviceId: claims.did } : null;
    },

    emailOf(userId: string): string | undefined {
      return userById(userId)?.email;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
