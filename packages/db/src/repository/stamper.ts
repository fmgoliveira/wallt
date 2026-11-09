import { createHlcClock, type HlcClock } from "@wallt/sync";

/**
 * Everything a write needs to stamp a synced row (PLAN §3.2): id, owner, timestamps and the clock value.
 * Repositories never generate these themselves, so P3 can swap in the real HLC (and add the outbox) in one place.
 */
export interface Stamper {
  /** Owner of every row written through this repository. */
  readonly userId: string;
  /** New UUIDv7 (text). */
  newId(): string;
  /** Current UTC time as an ISO string. */
  now(): string;
  /** Clock value for a write; strictly increasing on one device. */
  hlc(): string;
}

export type RandomBytes = (length: number) => Uint8Array;

/** `crypto.getRandomValues` when the runtime has it, otherwise `Math.random` (ids are not secrets). */
export const defaultRandomBytes: RandomBytes = (length) => {
  const out = new Uint8Array(length);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * UUIDv7 (RFC 9562): 48-bit unix-ms timestamp, version 7, 12-bit counter (`rand_a`) so ids created in the same
 * millisecond still sort in creation order, variant 10, 62 random bits.
 */
export function createUuidV7Generator(
  now: () => number = Date.now,
  random: RandomBytes = defaultRandomBytes,
): () => string {
  let lastMs = -1;
  let counter = 0;
  return () => {
    let ms = now();
    if (ms <= lastMs) {
      // same (or earlier, after a clock step back) millisecond: keep ordering with the counter
      ms = lastMs;
      counter += 1;
      if (counter > 0xfff) {
        ms += 1;
        counter = 0;
      }
    } else {
      counter = 0;
    }
    lastMs = ms;

    const b = new Uint8Array(16);
    const r = random(8);
    // 48-bit big-endian timestamp (split to stay inside safe-integer bit ops)
    const hi = Math.floor(ms / 0x10000);
    const lo = ms % 0x10000;
    b[0] = (hi >>> 24) & 0xff;
    b[1] = (hi >>> 16) & 0xff;
    b[2] = (hi >>> 8) & 0xff;
    b[3] = hi & 0xff;
    b[4] = (lo >>> 8) & 0xff;
    b[5] = lo & 0xff;
    b[6] = 0x70 | ((counter >>> 8) & 0x0f);
    b[7] = counter & 0xff;
    b[8] = 0x80 | ((r[0] ?? 0) & 0x3f);
    for (let i = 1; i < 8; i++) b[8 + i] = r[i] ?? 0;

    const h = hex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

export interface LocalStamperOptions {
  userId: string;
  /** Node id inside the clock value; use a stable per-install id. */
  nodeId?: string;
  clock?: () => number;
  random?: RandomBytes;
  /** Highest clock value already stored (see `SyncStore.maxHlc`), so values never go backwards after a restart. */
  initialHlc?: string;
}

/** A stamper backed by a real hybrid logical clock (ADR 0007); the sync engine feeds pulled values into `clock`. */
export interface HlcStamper extends Stamper {
  readonly clock: HlcClock;
  /** Switches the owner of future writes (after first sign-in, with `SyncStore.enroll`). */
  setUserId(userId: string): void;
}

export function createLocalStamper(options: LocalStamperOptions): HlcStamper {
  const wall = options.clock ?? Date.now;
  const newId = createUuidV7Generator(wall, options.random);
  const clock = createHlcClock({
    node: options.nodeId ?? "local",
    wallClock: wall,
    ...(options.initialHlc ? { initial: options.initialHlc } : {}),
  });
  let userId = options.userId;
  return {
    get userId() {
      return userId;
    },
    setUserId(next) {
      userId = next;
    },
    clock,
    newId,
    now: () => new Date(wall()).toISOString(),
    hlc: () => clock.now(),
  };
}
