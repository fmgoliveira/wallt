export type RateLimiter = {
  /** Registers one attempt for `key`; `retryAfterSec` is set when the limit is exceeded. */
  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number };
};

/** In-memory fixed-window limiter (single server process). */
export function createRateLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const t = now();
      if (buckets.size > 10_000)
        for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
      }
      b.count++;
      return b.count > max
        ? { ok: false, retryAfterSec: Math.ceil((b.resetAt - t) / 1000) }
        : { ok: true };
    },
  };
}
