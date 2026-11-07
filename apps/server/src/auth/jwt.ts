import { createHmac, timingSafeEqual } from "node:crypto";

/** `access` = API calls; `mfa` = password ok, second factor pending; `enrol` = 2FA enrolment pending. */
export type TokenScope = "access" | "mfa" | "enrol";

export type Claims = { sub: string; scp: TokenScope; did?: string; iat: number; exp: number };

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

const sign = (key: Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** HS256 JWT. `nowMs` is injectable for tests. */
export function signToken(
  key: Buffer,
  claims: Pick<Claims, "sub" | "scp"> & { did?: string },
  ttlSeconds: number,
  nowMs: number,
): string {
  const iat = Math.floor(nowMs / 1000);
  const payload = Buffer.from(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds })).toString(
    "base64url",
  );
  return `${HEADER}.${payload}.${sign(key, `${HEADER}.${payload}`).toString("base64url")}`;
}

/** Returns the claims only for a correctly signed, unexpired token of the expected scope. */
export function verifyToken(
  key: Buffer,
  token: string,
  scope: TokenScope,
  nowMs: number,
): Claims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  if (header !== HEADER) return null; // pins alg=HS256: rejects "none" and algorithm confusion
  const expected = sign(key, `${header}.${payload}`);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (c.scp !== scope || typeof c.sub !== "string" || typeof c.exp !== "number") return null;
    return c.exp * 1000 > nowMs ? c : null;
  } catch {
    return null;
  }
}
