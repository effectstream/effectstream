// Live ledger parameters for transaction validation — cached, refreshed in the
// background, and FAIL CLOSED.
//
// `Transaction.wellFormed` needs a LedgerState carrying the chain's current
// LedgerParameters. Those are governance-mutable: `global_ttl` feeds the TTL
// check and the size/limit ceilings feed `enforceLimits`. Validating against
// `LedgerParameters.initialParameters()` would therefore diverge from the node
// the moment governance changes anything — accepting transactions the node
// rejects, or rejecting ones it would accept.
//
// Three properties this module exists to guarantee:
//
//   1. NEVER fetch inside a request path. `get()` is synchronous. A validation
//      failure must not become a way to make the batcher issue network calls.
//   2. FAIL CLOSED. No parameters, or parameters older than `maxAgeMs`, means
//      validation cannot be COMPLETED — which is infrastructure (503), not a
//      judgement about the caller's transaction (400).
//   3. Single-flight, throttled refresh, so a burst of failures cannot turn
//      into a burst of indexer queries.

import { LedgerParameters } from "@midnight-ntwrk/ledger-v8";

/** A snapshot of the chain state validation needs. */
export interface BlockData {
  hash: string;
  height: number;
  ledgerParameters: LedgerParameters;
  /** Chain timestamp. Establishes cache FRESHNESS; never used as the clock. */
  timestamp: Date;
}

export type LedgerParamsUnavailable =
  | "never-fetched"
  | "stale";

export type LedgerParamsLookup =
  | { ok: true; params: LedgerParameters; height: number; ageMs: number }
  | { ok: false; reason: LedgerParamsUnavailable; ageMs?: number; lastError?: string };

export interface LedgerParamsCacheConfig {
  /** Indexer GraphQL endpoint. Same URL the adapter already queries. */
  indexer: string;
  /** Background refresh period. Default 60s. */
  refreshIntervalMs?: number;
  /**
   * Beyond this age the cache is STALE and `get()` fails closed. Default 10
   * minutes — comfortably more than a few missed refreshes, far less than the
   * window in which governance could plausibly change parameters unnoticed.
   */
  maxAgeMs?: number;
  /** Floor between refresh attempts, including failure-triggered ones. Default 5s. */
  minRefreshIntervalMs?: number;
  /**
   * DEVELOPMENT ONLY. Serve `LedgerParameters.initialParameters()` when the
   * indexer has never answered. This re-creates exactly the divergence this
   * module exists to prevent, so it must never be set against a real network;
   * it exists so an undeployed local stack can run before its indexer is up.
   */
  allowStaticFallback?: boolean;
  /** Test seam. Replaces the indexer query. */
  fetchBlockData?: () => Promise<BlockData>;
  /** Test seam. Defaults to `Date.now`. */
  now?: () => number;
}

/** Query the indexer for the latest block, including its ledger parameters. */
export function makeIndexerBlockDataFetcher(indexer: string): () => Promise<BlockData> {
  return async () => {
    const query = `query { block { hash height ledgerParameters timestamp } }`;
    const response = await fetch(indexer, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`indexer returned HTTP ${response.status}`);
    }
    const body = await response.json() as {
      data?: {
        block?: {
          hash: string;
          height: number;
          ledgerParameters: string;
          timestamp: string;
        };
      };
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new Error(`indexer error: ${body.errors[0]!.message}`);
    }
    const block = body.data?.block;
    if (!block) throw new Error("indexer returned no block");
    return {
      hash: block.hash,
      height: Number(block.height),
      ledgerParameters: LedgerParameters.deserialize(
        Buffer.from(block.ledgerParameters, "hex"),
      ),
      timestamp: new Date(block.timestamp),
    };
  };
}

export class LedgerParamsCache {
  private cached: { data: BlockData; fetchedAtMs: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The single in-flight refresh, shared by every caller that asks for one. */
  private inFlight: Promise<void> | null = null;
  private lastAttemptMs = 0;
  private lastError: string | undefined;
  private closed = false;

  private readonly fetchBlockData: () => Promise<BlockData>;
  private readonly now: () => number;
  private readonly refreshIntervalMs: number;
  private readonly maxAgeMs: number;
  private readonly minRefreshIntervalMs: number;

  constructor(private readonly config: LedgerParamsCacheConfig) {
    this.fetchBlockData = config.fetchBlockData ??
      makeIndexerBlockDataFetcher(config.indexer);
    this.now = config.now ?? (() => Date.now());
    this.refreshIntervalMs = config.refreshIntervalMs ?? 60_000;
    this.maxAgeMs = config.maxAgeMs ?? 600_000;
    this.minRefreshIntervalMs = config.minRefreshIntervalMs ?? 5_000;
  }

  /** Begin background refresh. Safe to call twice. */
  start(): void {
    if (this.timer || this.closed) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.refreshIntervalMs);
    // Never hold the process open for a cache.
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Stop refreshing and release the timer. Called from the adapter's close(). */
  close(): void {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Refresh once. Single-flight (concurrent callers share one attempt) and
   * throttled (`minRefreshIntervalMs`), so a burst of validation failures
   * cannot be turned into a burst of indexer queries.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const nowMs = this.now();
    if (nowMs - this.lastAttemptMs < this.minRefreshIntervalMs) {
      return Promise.resolve();
    }
    this.lastAttemptMs = nowMs;
    this.inFlight = (async () => {
      try {
        const data = await this.fetchBlockData();
        this.cached = { data, fetchedAtMs: this.now() };
        this.lastError = undefined;
      } catch (error) {
        // Keep serving the existing snapshot until it ages out — a transient
        // indexer blip should not immediately fail every request.
        this.lastError = error instanceof Error ? error.message : String(error);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /**
   * Current parameters, or the reason there are none. **Synchronous and never
   * fetches** — the whole point is that a request path cannot trigger network
   * I/O. Callers translate `ok: false` into a 503 (intake) or a park
   * (pre-spend).
   */
  get(): LedgerParamsLookup {
    if (!this.cached) {
      if (this.config.allowStaticFallback) {
        return {
          ok: true,
          params: LedgerParameters.initialParameters(),
          height: 0,
          ageMs: 0,
        };
      }
      return { ok: false, reason: "never-fetched", lastError: this.lastError };
    }
    const ageMs = this.now() - this.cached.fetchedAtMs;
    if (ageMs > this.maxAgeMs) {
      // Deliberately NOT falling back to the stale snapshot: parameters we know
      // to be out of date are exactly what this module exists to avoid.
      return { ok: false, reason: "stale", ageMs, lastError: this.lastError };
    }
    return {
      ok: true,
      params: this.cached.data.ledgerParameters,
      height: this.cached.data.height,
      ageMs,
    };
  }

  /**
   * Operational snapshot, merged into the adapter's `getHealthInfo()`. Without
   * this a 503 is mysterious: an operator cannot tell "indexer unreachable"
   * from "misconfigured" from "just started".
   */
  health(): Record<string, unknown> {
    const lookup = this.get();
    return {
      ready: lookup.ok,
      ...(lookup.ok
        ? { ageMs: lookup.ageMs, height: lookup.height }
        : { reason: lookup.reason, ...(lookup.ageMs !== undefined ? { ageMs: lookup.ageMs } : {}) }),
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
      ...(this.config.allowStaticFallback ? { staticFallback: true } : {}),
      maxAgeMs: this.maxAgeMs,
      refreshIntervalMs: this.refreshIntervalMs,
    };
  }
}
