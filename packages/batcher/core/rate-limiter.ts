/**
 * Rate limiting module for the batcher HTTP server.
 *
 * A request may consume several buckets (for example a target-global sponsor
 * budget and a verified wallet budget). Stores must check and record the whole
 * set atomically so concurrent requests cannot overshoot a configured cap or
 * partially consume one bucket when another is already exhausted.
 */

/**
 * Strategy for extracting identity rate limit buckets from a request.
 * - "ip": Per-IP quota (plus the target-global quota)
 * - "ip-and-address": A shared-IP ceiling plus a verified-wallet quota
 * - "composite": Per IP+verified-address quota (plus the target-global quota)
 */
export type RateLimitKeyStrategy = "ip" | "ip-and-address" | "composite";

/** One independently configured bucket consumed by an allowed request. */
export interface RateLimitBucket {
  key: string;
  maxRequests: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  /** Seconds until the client can retry (for Retry-After header). */
  retryAfterSeconds?: number;
  /** Which key triggered the limit. */
  limitedKey?: string;
}

/**
 * Pluggable storage interface for rate limit state.
 *
 * `consume` is deliberately one operation. Redis implementations should use a
 * Lua script or transaction, and SQL implementations should use a transaction
 * with the appropriate row/advisory locks. A split count-then-hit contract is
 * not sufficient: concurrent callers can all observe spare capacity and exceed
 * a sponsor budget.
 */
export interface RateLimitStore {
  consume(
    buckets: readonly RateLimitBucket[],
    nowMs: number,
    windowMs: number,
  ): Promise<RateLimitCheckResult>;

  /** Remove expired entries across all keys. */
  cleanup(nowMs: number, windowMs: number): Promise<void>;
}

/**
 * In-memory sliding-window rate limit store.
 *
 * `consume` contains no await points: checking and recording every bucket is a
 * single synchronous critical section in the JavaScript event loop.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits: Map<string, number[]> = new Map();

  /** Record a request hit directly. Exposed for diagnostics and focused tests. */
  async hit(key: string, nowMs: number): Promise<void> {
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    arr.push(nowMs);
  }

  /** Count hits in the current window. Exposed for diagnostics and tests. */
  async count(key: string, nowMs: number, windowMs: number): Promise<number> {
    return this.prune(key, nowMs, windowMs).length;
  }

  /** Return the oldest unexpired hit. Exposed for diagnostics and tests. */
  async oldestHitInWindow(
    key: string,
    nowMs: number,
    windowMs: number,
  ): Promise<number | undefined> {
    return this.prune(key, nowMs, windowMs)[0];
  }

  async consume(
    buckets: readonly RateLimitBucket[],
    nowMs: number,
    windowMs: number,
  ): Promise<RateLimitCheckResult> {
    // A duplicate key must never be charged twice. If callers provide
    // conflicting ceilings, the stricter one wins.
    const unique = new Map<string, RateLimitBucket>();
    for (const bucket of buckets) {
      const previous = unique.get(bucket.key);
      if (!previous || bucket.maxRequests < previous.maxRequests) {
        unique.set(bucket.key, bucket);
      }
    }

    const active = new Map<string, number[]>();
    for (const bucket of unique.values()) {
      const hits = this.prune(bucket.key, nowMs, windowMs);
      active.set(bucket.key, hits);
      if (hits.length >= bucket.maxRequests) {
        const oldest = hits[0];
        const retryAfterMs = oldest === undefined
          ? windowMs
          : (oldest + windowMs) - nowMs;
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(Math.max(retryAfterMs, 0) / 1000),
          limitedKey: bucket.key,
        };
      }
    }

    // No await occurs between the checks above and these writes.
    for (const bucket of unique.values()) {
      const hits = active.get(bucket.key) ?? [];
      hits.push(nowMs);
      this.hits.set(bucket.key, hits);
    }

    return { allowed: true };
  }

  async cleanup(nowMs: number, windowMs: number): Promise<void> {
    for (const key of this.hits.keys()) {
      this.prune(key, nowMs, windowMs);
    }
  }

  private prune(key: string, nowMs: number, windowMs: number): number[] {
    const arr = this.hits.get(key);
    if (!arr) return [];

    const cutoff = nowMs - windowMs;
    const pruned = arr.filter((timestamp) => timestamp > cutoff);
    if (pruned.length === 0) {
      this.hits.delete(key);
      return [];
    }
    this.hits.set(key, pruned);
    return pruned;
  }
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Check keys that all use the limiter's default ceiling. */
  async check(keys: readonly string[]): Promise<RateLimitCheckResult> {
    return this.checkBuckets(
      keys.map((key) => ({ key, maxRequests: this.maxRequests })),
    );
  }

  /** Atomically check and consume buckets with independent ceilings. */
  async checkBuckets(
    buckets: readonly RateLimitBucket[],
  ): Promise<RateLimitCheckResult> {
    return await this.store.consume(buckets, Date.now(), this.windowMs);
  }
}
