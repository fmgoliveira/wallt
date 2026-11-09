import { idSchema } from "@wallt/core";
import { describe, expect, it } from "vitest";
import { createLocalStamper, createUuidV7Generator } from "./stamper";

const fixedRandom = (n: number) => new Uint8Array(n).fill(0xab);

describe("createUuidV7Generator", () => {
  it("produces RFC 9562 v7 uuids that satisfy the core id schema", () => {
    const gen = createUuidV7Generator(() => 1_700_000_000_000, fixedRandom);
    const id = gen();
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("embeds the timestamp in the first 48 bits", () => {
    const ms = 1_700_000_000_123;
    const id = createUuidV7Generator(() => ms, fixedRandom)();
    const stamp = Number.parseInt(id.replace(/-/g, "").slice(0, 12), 16);
    expect(stamp).toBe(ms);
  });

  it("keeps ids in creation order inside one millisecond and across a clock step back", () => {
    let t = 1_700_000_000_000;
    const gen = createUuidV7Generator(() => t, fixedRandom);
    const ids = [gen(), gen(), gen()];
    t -= 5000; // clock moved backwards
    ids.push(gen());
    t += 10_000;
    ids.push(gen());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rolls the millisecond over when the 12-bit counter is exhausted", () => {
    const gen = createUuidV7Generator(() => 1_700_000_000_000, fixedRandom);
    const ids = Array.from({ length: 4100 }, () => gen());
    expect(new Set(ids).size).toBe(4100);
    expect([...ids].sort()).toEqual(ids);
  });

  it("works with the real random source", () => {
    const gen = createUuidV7Generator();
    expect(idSchema.safeParse(gen()).success).toBe(true);
  });
});

describe("createLocalStamper", () => {
  it("returns an ISO timestamp and strictly increasing hlc values", () => {
    let t = Date.UTC(2026, 10, 8);
    const s = createLocalStamper({ userId: "local", nodeId: "dev1", clock: () => t });
    const a = s.hlc();
    const b = s.hlc();
    t += 1;
    const c = s.hlc();
    t -= 100; // clock regression must not go backwards
    const d = s.hlc();
    expect([a, b, c, d]).toEqual([...[a, b, c, d]].sort());
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(a.endsWith("-dev1")).toBe(true);
    expect(s.now()).toBe(new Date(t).toISOString());
    expect(s.userId).toBe("local");
  });
});
