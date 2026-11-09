import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, lockoutMs, newSalt, sha256Hex, shouldLock, verifyPin } from "./lock";

describe("shouldLock", () => {
  const base = { enabled: true, timeoutMs: 60_000, backgroundedAt: 1_000, now: 1_000 };
  it("never locks when the lock is off or the app never left the foreground", () => {
    expect(shouldLock({ ...base, enabled: false, now: 10_000_000 })).toBe(false);
    expect(shouldLock({ ...base, backgroundedAt: null, now: 10_000_000 })).toBe(false);
  });
  it("locks once the time in the background reaches the timeout", () => {
    expect(shouldLock({ ...base, now: 1_000 + 59_999 })).toBe(false);
    expect(shouldLock({ ...base, now: 1_000 + 60_000 })).toBe(true);
  });
  it("with an immediate timeout locks on every return", () => {
    expect(shouldLock({ ...base, timeoutMs: 0, now: 1_000 })).toBe(true);
  });
});

describe("pin rules", () => {
  it("accepts 4 to 8 digits only", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
  it("delays attempts after five failures, doubling up to a cap", () => {
    expect([0, 1, 4].map(lockoutMs)).toEqual([0, 0, 0]);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(7)).toBe(120_000);
    expect(lockoutMs(50)).toBe(900_000);
  });
});

describe("sha256", () => {
  it("matches the published test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
  it("handles inputs that cross block boundaries", () => {
    // 1,000 'a' characters: reference value from the standard library
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });
});

describe("hashPin", () => {
  it("verifies the right PIN and rejects others", () => {
    const salt = newSalt();
    const hash = hashPin("4821", salt);
    expect(verifyPin("4821", salt, hash)).toBe(true);
    expect(verifyPin("4822", salt, hash)).toBe(false);
    expect(verifyPin("4821", newSalt(), hash)).toBe(false);
  });
  it("salts: the same PIN hashes differently with different salts", () => {
    expect(hashPin("4821", "aa")).not.toBe(hashPin("4821", "bb"));
    expect(hashPin("4821", "aa")).toBe(hashPin("4821", "aa"));
  });
  it("makes a 32-character hex salt", () => {
    expect(newSalt()).toMatch(/^[0-9a-f]{32}$/);
  });
});
