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
  /**
   * Cost of this request against the bucket, in the same units as
   * `maxRequests`. Must be an integer >= 1. Defaults to 1, so callers that
   * do not set it behave exactly as before.
   *
   * Requests are not uniformly expensive. Validating a 46-output Midnight
   * transaction costs seconds of CPU against milliseconds for a simple
   * transfer, so charging both a single request lets the expensive shape
   * exhaust a sponsor's capacity while staying inside its request allowance.
   */
  weight?: number;
}

/**
 * Resolve and validate a bucket's cost.
 *
 * A bad weight is a programming error in the caller, not a client problem:
 * throw rather than clamp, so it surfaces at the call site instead of
 * silently under-charging every request through that path.
 */
function bucketWeight(bucket: RateLimitBucket): number {
  const weight = bucket.weight ?? 1;
  if (!Number.isInteger(weight) || weight < 1) {
    throw new Error(
      `rate limit bucket "${bucket.key}" has invalid weight ` +
        `${String(bucket.weight)}: expected an integer >= 1`,
    );
  }
  return weight;
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
 *
 * Implementations must honour `RateLimitBucket.weight` (default 1): a bucket
 * admits a request only when its consumed weight plus the request's weight
 * stays within `maxRequests`, and it records the weight rather than a single
 * hit. A store that ignores the field silently under-charges expensive
 * requests.
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
 * Seconds until a rejected request could fit, or `undefined` when it never
 * can.
 *
 * With weights, waiting for the single oldest entry is not enough: a request
 * costing 3 against a full bucket needs three units to leave the window.
 * `hits` is oldest-first, so the unit at index `mustFree - 1` is the last one
 * that has to expire.
 */
function retryAfterSecondsFor(
  hits: readonly number[],
  bucket: Required<RateLimitBucket>,
  nowMs: number,
  windowMs: number,
): number | undefined {
  // A request heavier than the entire bucket can never be admitted, however
  // long the caller waits. Report no retry time rather than a misleading one.
  if (bucket.weight > bucket.maxRequests) return undefined;

  const mustFree = hits.length + bucket.weight - bucket.maxRequests;
  const lastToExpire = hits[mustFree - 1];
  const retryAfterMs = lastToExpire === undefined
    ? windowMs
    : (lastToExpire + windowMs) - nowMs;
  return Math.ceil(Math.max(retryAfterMs, 0) / 1000);
}

/**
 * In-memory sliding-window rate limit store.
 *
 * `consume` contains no await points: checking and recording every bucket is a
 * single synchronous critical section in the JavaScript event loop.
 *
 * Weight is recorded as one timestamp per consumed unit, so a key's stored
 * entries are its consumed weight and stay bounded by `maxRequests` — a
 * request is never admitted past the ceiling, so the array cannot grow past
 * it either.
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

  /**
   * Consumed weight in the current window. Exposed for diagnostics and tests.
   *
   * For unweighted callers this is the hit count, unchanged.
   */
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
    // A duplicate key must never be charged at two different ceilings: the
    // stricter ceiling wins. Weights sum, because one request that names the
    // same key twice really does cost both against it.
    //
    // Every weight is validated here, before any bucket is inspected or
    // written, so an invalid weight cannot leave a request partially charged.
    const unique = new Map<string, Required<RateLimitBucket>>();
    for (const bucket of buckets) {
      const weight = bucketWeight(bucket);
      const previous = unique.get(bucket.key);
      if (!previous) {
        unique.set(bucket.key, {
          key: bucket.key,
          maxRequests: bucket.maxRequests,
          weight,
        });
      } else {
        previous.maxRequests = Math.min(previous.maxRequests, bucket.maxRequests);
        previous.weight += weight;
      }
    }

    const active = new Map<string, number[]>();
    for (const bucket of unique.values()) {
      const hits = this.prune(bucket.key, nowMs, windowMs);
      active.set(bucket.key, hits);
      if (hits.length + bucket.weight > bucket.maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: retryAfterSecondsFor(hits, bucket, nowMs, windowMs),
          limitedKey: bucket.key,
        };
      }
    }

    // No await occurs between the checks above and these writes.
    for (const bucket of unique.values()) {
      const hits = active.get(bucket.key) ?? [];
      for (let unit = 0; unit < bucket.weight; unit += 1) {
        hits.push(nowMs);
      }
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
