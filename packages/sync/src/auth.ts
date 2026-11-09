/**
 * Device sign-in against the server's `/auth/*` routes (password, then TOTP or a recovery code) and the session that
 * keeps the sync engine authorised. IO is injected (`fetch`, storage), so this stays testable and free of platform code.
 */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type AuthErrorKind =
  | "invalid_credentials"
  | "invalid_code"
  | "locked"
  | "expired"
  | "rate_limited"
  | "enrol_required"
  | "offline"
  | "server";

export class AuthClientError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "AuthClientError";
  }
}

/** What is persisted between launches (in secure storage on Android). */
export interface StoredSession {
  baseUrl: string;
  userId: string;
  email: string;
  deviceId: string;
  accessToken: string;
  /** Epoch ms at which the access token expires. */
  accessExpiresAt: number;
  refreshToken: string;
}

export interface SessionStorage {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/;

/**
 * Cleans a server address typed by the user. Returns null when it is not a usable origin. Plain `http` is only accepted for
 * local/private hosts (development, home network): anything else must be `https`, since passwords and tokens travel in it.
 */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && PRIVATE_HOST.test(url.hostname)) return url.origin;
  return null;
}

type Json = Record<string, unknown>;

export type LoginResult =
  | { status: "mfa_required"; challengeToken: string }
  | { status: "enrol_required" };

export interface SignInDevice {
  deviceId: string;
  deviceName: string;
  platform: "android" | "web" | "other";
}

export interface AuthClient {
  login(email: string, password: string): Promise<LoginResult>;
  /** Completes sign-in with a TOTP `code` or a one-time `recoveryCode`. */
  verify(
    challengeToken: string,
    proof: { code: string } | { recoveryCode: string },
  ): Promise<StoredSession>;
  logout(session: StoredSession): Promise<void>;
}

export function createAuthClient(options: {
  baseUrl: string;
  fetch: Fetch;
  device: SignInDevice;
  now?: () => number;
}): AuthClient {
  const now = options.now ?? Date.now;

  async function post(
    path: string,
    body: Json,
    token?: string,
  ): Promise<{ status: number; json: Json }> {
    let res: Response;
    try {
      res = await options.fetch(`${options.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new AuthClientError("offline", cause instanceof Error ? cause.message : "offline");
    }
    const json = (await res.json().catch(() => ({}))) as Json;
    return { status: res.status, json };
  }

  function fail(status: number, json: Json): never {
    const code = String(json.error ?? "");
    if (code === "locked") throw new AuthClientError("locked");
    if (code === "invalid_token") throw new AuthClientError("expired");
    if (status === 429) throw new AuthClientError("rate_limited");
    if (code === "invalid_code") throw new AuthClientError("invalid_code");
    if (status === 401) throw new AuthClientError("invalid_credentials");
    throw new AuthClientError("server", `HTTP ${status}`);
  }

  return {
    async login(email, password) {
      const { status, json } = await post("/auth/login", { email, password });
      if (status !== 200) fail(status, json);
      if (json.status === "mfa_required" && typeof json.challengeToken === "string") {
        return { status: "mfa_required", challengeToken: json.challengeToken };
      }
      if (json.status === "enrol_required") return { status: "enrol_required" };
      throw new AuthClientError("server", "unexpected login response");
    },

    async verify(challengeToken, proof) {
      const { status, json } = await post("/auth/login/verify", {
        challengeToken,
        ...proof,
        deviceName: options.device.deviceName,
        platform: options.device.platform,
        deviceId: options.device.deviceId,
      });
      if (status !== 200) fail(status, json);
      const accessToken = String(json.accessToken ?? "");
      const refreshToken = String(json.refreshToken ?? "");
      const expiresIn = Number(json.expiresIn);
      if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
        throw new AuthClientError("server", "unexpected session response");
      }
      const meRes = await options
        .fetch(`${options.baseUrl}/auth/me`, {
          headers: { authorization: `Bearer ${accessToken}` },
        })
        .catch(() => null);
      const me = (meRes?.ok ? await meRes.json().catch(() => null) : null) as Json | null;
      if (!me || typeof me.userId !== "string")
        throw new AuthClientError("server", "could not read profile");
      return {
        baseUrl: options.baseUrl,
        userId: me.userId,
        email: String(me.email ?? ""),
        deviceId: String(json.deviceId ?? options.device.deviceId),
        accessToken,
        accessExpiresAt: now() + expiresIn * 1000,
        refreshToken,
      };
    },

    async logout(session) {
      // best effort: the device is also removable from another device
      await post("/auth/logout", {}, session.accessToken).catch(() => undefined);
    },
  };
}

export interface SessionManager {
  current(): StoredSession | null;
  /** A valid access token, refreshed when it is about to expire; null when signed out or the refresh was refused. */
  getAccessToken(): Promise<string | null>;
  set(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/** Keeps the access token fresh (single-flight, rotating refresh tokens are persisted) and drops the session when refused. */
export function createSessionManager(options: {
  storage: SessionStorage;
  fetch: Fetch;
  initial: StoredSession | null;
  now?: () => number;
  /** Called when the server refuses the refresh token for good (revoked device, reuse detected). */
  onSignedOut?: () => void;
}): SessionManager {
  const now = options.now ?? Date.now;
  let session = options.initial;
  let refreshing: Promise<string | null> | null = null;

  async function refresh(s: StoredSession): Promise<string | null> {
    let res: Response;
    try {
      res = await options.fetch(`${s.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
    } catch {
      return null; // offline: keep the session, try again next time
    }
    if (res.status === 401 || res.status === 403) {
      session = null;
      await options.storage.clear();
      options.onSignedOut?.();
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as Json;
    if (typeof json.accessToken !== "string" || typeof json.refreshToken !== "string") return null;
    const next: StoredSession = {
      ...s,
      accessToken: json.accessToken,
      refreshToken: json.refreshToken,
      accessExpiresAt: now() + Number(json.expiresIn ?? 0) * 1000,
    };
    session = next;
    await options.storage.save(next);
    return next.accessToken;
  }

  return {
    current: () => session,
    async getAccessToken() {
      const s = session;
      if (!s) return null;
      if (s.accessExpiresAt - now() > 60_000) return s.accessToken;
      refreshing ??= refresh(s).finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
    async set(next) {
      session = next;
      await options.storage.save(next);
    },
    async clear() {
      session = null;
      await options.storage.clear();
    },
  };
}
