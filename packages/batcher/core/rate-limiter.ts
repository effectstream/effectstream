/**
 * Rate limiting module for the batcher HTTP server.
 *
 * Provides a pluggable storage interface with an in-memory sliding window
 * implementation, and a RateLimiter class that supports multiple key strategies.
 */

/**
 * Strategy for extracting rate limit keys from a request.
 * - "ip": Rate limit by IP address only (default)
 * - "ip-and-address": Independent limits on both IP and wallet address
 * - "composite": Single limit on combined IP+address key
 */
export type RateLimitKeyStrategy = "ip" | "ip-and-address" | "composite";

/**
 * Pluggable storage interface for rate limit state.
 * All timestamp parameters are epoch milliseconds.
 */
export interface RateLimitStore {
  /** Record a request hit for the given key. */
  hit(key: string, nowMs: number): Promise<void>;

  /** Count hits for the given key within [nowMs - windowMs, nowMs]. */
  count(key: string, nowMs: number, windowMs: number): Promise<number>;

  /** Get the oldest hit timestamp within the current window. Returns undefined if none. */
  oldestHitInWindow(
    key: string,
    nowMs: number,
    windowMs: number,
  ): Promise<number | undefined>;

  /** Remove expired entries across all keys. */
  cleanup(nowMs: number, windowMs: number): Promise<void>;
}

/**
 * In-memory sliding window rate limit store.
 * Uses a Map of sorted timestamp arrays. Expired entries are pruned lazily on count().
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits: Map<string, number[]> = new Map();

  async hit(key: string, nowMs: number): Promise<void> {
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    arr.push(nowMs);
  }

  async count(key: string, nowMs: number, windowMs: number): Promise<number> {
    const arr = this.hits.get(key);
    if (!arr) return 0;

    const cutoff = nowMs - windowMs;
    // Prune expired entries
    const pruned = arr.filter((ts) => ts > cutoff);
    if (pruned.length === 0) {
      this.hits.delete(key);
      return 0;
    }
    this.hits.set(key, pruned);
    return pruned.length;
  }

  async oldestHitInWindow(
    key: string,
    nowMs: number,
    windowMs: number,
  ): Promise<number | undefined> {
    const arr = this.hits.get(key);
    if (!arr) return undefined;

    const cutoff = nowMs - windowMs;
    for (const ts of arr) {
      if (ts > cutoff) return ts;
    }
    return undefined;
  }

  async cleanup(nowMs: number, windowMs: number): Promise<void> {
    const cutoff = nowMs - windowMs;
    for (const [key, arr] of this.hits) {
      const pruned = arr.filter((ts) => ts > cutoff);
      if (pruned.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, pruned);
      }
    }
  }
}

export interface RateLimitCheckResult {
  allowed: boolean;
  /** Seconds until the client can retry (for Retry-After header) */
  retryAfterSeconds?: number;
  /** Which key triggered the limit */
  limitedKey?: string;
}

/**
 * Rate limiter using a pluggable store.
 * check() is atomic: all keys are verified first, hits recorded only if all pass.
 */
export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async check(keys: string[]): Promise<RateLimitCheckResult> {
    const nowMs = Date.now();

    // Check all keys before recording any hits
    for (const key of keys) {
      const currentCount = await this.store.count(key, nowMs, this.windowMs);
      if (currentCount >= this.maxRequests) {
        const oldest = await this.store.oldestHitInWindow(
          key,
          nowMs,
          this.windowMs,
        );
        const retryAfterMs = oldest
          ? (oldest + this.windowMs) - nowMs
          : this.windowMs;
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(Math.max(retryAfterMs, 0) / 1000),
          limitedKey: key,
        };
      }
    }

    // All keys passed — record hits
    for (const key of keys) {
      await this.store.hit(key, nowMs);
    }

    return { allowed: true };
  }
}
