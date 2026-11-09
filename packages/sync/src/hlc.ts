/**
 * Hybrid logical clock (PLAN §4). A value is the fixed-width, lexicographically ordered string
 * `<wall ms, 12 hex>-<counter, 4 hex>-<node id>`, so plain string comparison is the clock order (ties between devices
 * break on the node id). Every write on a device gets a strictly larger value than anything it wrote or saw before.
 */

export interface ParsedHlc {
  ms: number;
  counter: number;
  node: string;
}

const HLC_RE = /^([0-9a-f]{12})-([0-9a-f]{4})-(.+)$/;
const MAX_COUNTER = 0xffff;

export function formatHlc(ms: number, counter: number, node: string): string {
  return `${ms.toString(16).padStart(12, "0")}-${counter.toString(16).padStart(4, "0")}-${node}`;
}

export function parseHlc(value: string): ParsedHlc | null {
  const m = HLC_RE.exec(value);
  if (!m) return null;
  return {
    ms: Number.parseInt(m[1] as string, 16),
    counter: Number.parseInt(m[2] as string, 16),
    node: m[3] as string,
  };
}

/** Orders two clock values; negative when `a` is older. */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface HlcClock {
  /** Clock value for a local write (strictly greater than every previous value of this clock). */
  now(): string;
  /** Folds in a value seen from another device so later local writes sort after it. Returns false when ignored. */
  receive(remote: string): boolean;
  /** Last value issued or received (the empty string before any). */
  last(): string;
  readonly node: string;
}

export interface HlcClockOptions {
  node: string;
  /** Wall clock in ms; tests inject one. */
  wallClock?: () => number;
  /** A previously persisted value (e.g. the max stored `hlc`), so the clock never goes backwards across restarts. */
  initial?: string;
  /** Remote values further ahead than this are ignored instead of dragging the clock forward. Default 24 h. */
  maxDriftMs?: number;
}

export function createHlcClock(options: HlcClockOptions): HlcClock {
  const wall = options.wallClock ?? Date.now;
  const maxDrift = options.maxDriftMs ?? 24 * 60 * 60 * 1000;
  const start = options.initial ? parseHlc(options.initial) : null;
  // Only the (ms, counter) pair matters for ordering; the node id is always our own in what we issue.
  let ms = start?.ms ?? 0;
  let counter = start?.counter ?? 0;
  let issued = start && options.initial ? options.initial : "";

  /** Moves to max(wall, ms, remote.ms) with the counter rules of the HLC paper. */
  const advance = (remote: ParsedHlc | null) => {
    const next = Math.max(wall(), ms, remote?.ms ?? 0);
    let c = 0;
    const fromLocal = next === ms;
    const fromRemote = remote !== null && next === remote.ms;
    if (fromLocal && fromRemote) c = Math.max(counter, remote.counter) + 1;
    else if (fromLocal) c = counter + 1;
    else if (fromRemote) c = remote.counter + 1;
    if (c > MAX_COUNTER) {
      ms = next + 1;
      counter = 0;
    } else {
      ms = next;
      counter = c;
    }
    issued = formatHlc(ms, counter, options.node);
  };

  return {
    node: options.node,
    now() {
      advance(null);
      return issued;
    },
    receive(remote) {
      const parsed = parseHlc(remote);
      if (!parsed || parsed.ms > wall() + maxDrift) return false;
      // Already behind what we issued: nothing to learn.
      if (parsed.ms < ms || (parsed.ms === ms && parsed.counter <= counter)) return true;
      advance(parsed);
      return true;
    },
    last: () => issued,
  };
}
