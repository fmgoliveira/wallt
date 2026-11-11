import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Bytes, sha256Hex } from "./sha256";

const ref = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

describe("sha256", () => {
  it("matches node:crypto for strings, including multi-byte characters", () => {
    for (const s of ["", "abc", "Saúde € 12,50 😀", "x".repeat(1000)]) {
      expect(sha256Hex(s)).toBe(ref(s));
    }
  });

  it("matches node:crypto for bytes around every padding boundary", () => {
    for (let n = 0; n <= 200; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 0xff);
      expect(sha256Bytes(b)).toBe(ref(b));
    }
  });

  it("hashes a 2 MB buffer", () => {
    const b = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, i) => (i * 7) & 0xff);
    expect(sha256Bytes(b)).toBe(ref(b));
  });
});
