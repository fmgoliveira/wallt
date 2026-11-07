import { describe, expect, it, vi } from "vitest";
import {
  decrypt,
  deriveKeys,
  dummyHash,
  encrypt,
  hashPassword,
  safeEqual,
  verifyPassword,
} from "./crypto";
import { signToken, verifyToken } from "./jwt";
import { createRateLimiter } from "./rate-limit";
import {
  base32Decode,
  base32Encode,
  generateSecret,
  generateTotp,
  otpauthUri,
  verifyTotp,
} from "./totp";

vi.setConfig({ testTimeout: 30_000 });

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("password hashing", () => {
  it("produces a self-describing argon2id string and verifies it", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(h); // random salt
  });
  it("rejects malformed hashes and provides a dummy hash", async () => {
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", await dummyHash())).toBe(false);
  });
});

describe("encryption and keys", () => {
  it("round-trips, uses a fresh IV and detects tampering", () => {
    const { encKey } = deriveKeys(KEY);
    const a = encrypt(encKey, "JBSWY3DPEHPK3PXP");
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(encrypt(encKey, "JBSWY3DPEHPK3PXP"));
    expect(decrypt(encKey, a)).toBe("JBSWY3DPEHPK3PXP");
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(encKey, parts.join("."))).toThrow();
    expect(() => decrypt(deriveKeys(Buffer.alloc(32, 8).toString("base64")).encKey, a)).toThrow();
    expect(() => decrypt(encKey, "v2.a.b.c")).toThrow();
  });
  it("derives independent keys", () => {
    const k = deriveKeys(KEY);
    expect(k.encKey.length).toBe(32);
    expect(k.encKey.equals(k.jwtKey)).toBe(false);
    expect(deriveKeys(KEY).jwtKey.equals(k.jwtKey)).toBe(true);
  });
  it("compares strings in constant time semantics", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("TOTP (RFC 6238)", () => {
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vectors (6 digits)", () => {
    const at = (s: number) => generateTotp(rfcSecret, s * 1000);
    expect(at(59)).toBe("287082");
    expect(at(1111111109)).toBe("081804");
    expect(at(1234567890)).toBe("005924");
    expect(at(2000000000)).toBe("279037");
    expect(at(20000000000)).toBe("353130");
  });
  it("accepts +/-1 step, rejects further and malformed codes, returns the step", () => {
    const now = 1111111109 * 1000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(rfcSecret, "081804", now)).toBe(step);
    expect(verifyTotp(rfcSecret, "081804", now + 30000)).toBe(step);
    expect(verifyTotp(rfcSecret, "081804", now - 30000)).toBe(step);
    expect(verifyTotp(rfcSecret, "081804", now + 90000)).toBeNull();
    expect(verifyTotp(rfcSecret, "12345", now)).toBeNull();
    expect(verifyTotp(rfcSecret, "abcdef", now)).toBeNull();
  });
  it("base32 round-trips and builds the otpauth URI", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(() => base32Decode("not base32!")).toThrow();
    const uri = otpauthUri("Wallt", "me@example.com", secret);
    expect(uri).toBe(
      `otpauth://totp/Wallt:me%40example.com?secret=${secret}&issuer=Wallt&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe("JWT", () => {
  const { jwtKey } = deriveKeys(KEY);
  const now = 1_700_000_000_000;
  it("verifies scope, expiry and signature", () => {
    const t = signToken(jwtKey, { sub: "u1", scp: "access", did: "d1" }, 60, now);
    expect(verifyToken(jwtKey, t, "access", now)).toMatchObject({
      sub: "u1",
      did: "d1",
      scp: "access",
    });
    expect(verifyToken(jwtKey, t, "mfa", now)).toBeNull();
    expect(verifyToken(jwtKey, t, "access", now + 61_000)).toBeNull();
    expect(
      verifyToken(deriveKeys(Buffer.alloc(32, 9).toString("base64")).jwtKey, t, "access", now),
    ).toBeNull();
    const [h, p, s] = t.split(".") as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ sub: "u2", scp: "access", exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifyToken(jwtKey, `${h}.${forged}.${s}`, "access", now)).toBeNull();
    expect(verifyToken(jwtKey, "garbage", "access", now)).toBeNull();
    expect(p.length).toBeGreaterThan(0);
  });
  it("rejects alg=none and other headers", () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const payload = enc({ sub: "u1", scp: "access", exp: 9_999_999_999 });
    expect(
      verifyToken(jwtKey, `${enc({ alg: "none", typ: "JWT" })}.${payload}.`, "access", now),
    ).toBeNull();
    expect(
      verifyToken(jwtKey, `${enc({ alg: "HS512", typ: "JWT" })}.${payload}.abc`, "access", now),
    ).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows `max` hits per window per key, then recovers", () => {
    let t = 0;
    const rl = createRateLimiter(2, 1000, () => t);
    expect(rl.hit("a").ok).toBe(true);
    expect(rl.hit("a").ok).toBe(true);
    const blocked = rl.hit("a");
    expect(blocked).toEqual({ ok: false, retryAfterSec: 1 });
    expect(rl.hit("b").ok).toBe(true);
    t = 1000;
    expect(rl.hit("a").ok).toBe(true);
  });
});
