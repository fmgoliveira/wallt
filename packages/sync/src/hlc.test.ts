import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareHlc, createHlcClock, formatHlc, parseHlc } from "./hlc";

describe("hlc format", () => {
  it("round-trips and keeps node ids with dashes", () => {
    const v = formatHlc(1_700_000_000_000, 5, "0190-abc-def");
    expect(parseHlc(v)).toEqual({ ms: 1_700_000_000_000, counter: 5, node: "0190-abc-def" });
  });

  it("rejects malformed values", () => {
    for (const bad of ["", "x", "123-0001-n", "000000000001-1-n", "000000000001-0001-"]) {
      expect(parseHlc(bad)).toBeNull();
    }
  });

  it("string order equals (ms, counter, node) order", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat(2 ** 40), fc.nat(0xffff), fc.constantFrom("a", "b")),
        fc.tuple(fc.nat(2 ** 40), fc.nat(0xffff), fc.constantFrom("a", "b")),
        ([m1, c1, n1], [m2, c2, n2]) => {
          const expected = m1 - m2 || c1 - c2 || (n1 < n2 ? -1 : n1 > n2 ? 1 : 0);
          expect(Math.sign(compareHlc(formatHlc(m1, c1, n1), formatHlc(m2, c2, n2)))).toBe(
            Math.sign(expected),
          );
        },
      ),
    );
  });
});

describe("hlc clock", () => {
  it("is strictly increasing even with a frozen or backwards wall clock", () => {
    let wall = 1000;
    const clock = createHlcClock({ node: "n", wallClock: () => wall });
    const seen: string[] = [];
    for (const w of [1000, 1000, 1000, 900, 5000, 5000, 100]) {
      wall = w;
      seen.push(clock.now());
    }
    expect(seen).toEqual([...seen].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("rolls into the next millisecond when the counter overflows", () => {
    const clock = createHlcClock({
      node: "n",
      wallClock: () => 10,
      initial: formatHlc(10, 0xffff, "n"),
    });
    const next = parseHlc(clock.now());
    expect(next).toMatchObject({ ms: 11, counter: 0 });
  });

  it("never goes backwards across a restart (initial value)", () => {
    const first = createHlcClock({ node: "n", wallClock: () => 5000 });
    const last = first.now();
    const restarted = createHlcClock({ node: "n", wallClock: () => 1000, initial: last });
    expect(restarted.now() > last).toBe(true);
  });

  it("receive makes later local writes sort after the remote value", () => {
    const a = createHlcClock({ node: "a", wallClock: () => 1000 });
    const remote = formatHlc(9000, 7, "b");
    expect(a.receive(remote)).toBe(true);
    expect(a.now() > remote).toBe(true);
  });

  it("ignores malformed values and values far in the future", () => {
    const a = createHlcClock({ node: "a", wallClock: () => 1000, maxDriftMs: 60_000 });
    expect(a.receive("nope")).toBe(false);
    expect(a.receive(formatHlc(1000 + 60_001, 0, "b"))).toBe(false);
    expect(a.now() < formatHlc(2000, 0, "a")).toBe(true);
  });

  it("two devices exchanging values always issue increasing, distinct values", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ dev: fc.constantFrom(0, 1), dt: fc.nat(50), sync: fc.boolean() }), {
          minLength: 1,
          maxLength: 60,
        }),
        (steps) => {
          let t = 1_000_000;
          const clocks = [
            createHlcClock({ node: "a", wallClock: () => t }),
            createHlcClock({ node: "b", wallClock: () => t }),
          ];
          const issuedBy: string[][] = [[], []];
          for (const s of steps) {
            t += s.dt;
            const c = clocks[s.dev];
            if (!c) throw new Error("unreachable");
            const v = c.now();
            const prev = issuedBy[s.dev]?.at(-1);
            if (prev) expect(v > prev).toBe(true);
            issuedBy[s.dev]?.push(v);
            if (s.sync) clocks[1 - s.dev]?.receive(v);
          }
          const all = issuedBy.flat();
          expect(new Set(all).size).toBe(all.length);
        },
      ),
    );
  });
});
