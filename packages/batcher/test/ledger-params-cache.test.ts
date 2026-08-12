// The cache exists to make one guarantee: validation never runs against
// parameters we cannot vouch for. Each test below pins one way that guarantee
// could be quietly lost.

import { describe, expect, test } from "bun:test";
import {
  type BlockData,
  LedgerParamsCache,
} from "../adapters/ledger-params-cache.ts";

/** A fake block. `ledgerParameters` is opaque here — identity is all we check. */
const blockAt = (height: number): BlockData =>
  ({
    hash: `hash-${height}`,
    height,
    ledgerParameters: { marker: height } as never,
    timestamp: new Date(1_700_000_000_000 + height),
  }) as BlockData;

/** Controllable clock so age can be tested without sleeping. */
function harness(opts: {
  fetch?: () => Promise<BlockData>;
  maxAgeMs?: number;
  minRefreshIntervalMs?: number;
  allowStaticFallback?: boolean;
} = {}) {
  let nowMs = 1_000_000;
  const calls = { count: 0 };
  const cache = new LedgerParamsCache({
    indexer: "http://unused",
    now: () => nowMs,
    maxAgeMs: opts.maxAgeMs ?? 600_000,
    minRefreshIntervalMs: opts.minRefreshIntervalMs ?? 0,
    allowStaticFallback: opts.allowStaticFallback,
    fetchBlockData: opts.fetch ?? (async () => {
      calls.count += 1;
      return blockAt(calls.count);
    }),
  });
  return { cache, calls, advance: (ms: number) => { nowMs += ms; }, nowMs: () => nowMs };
}

describe("fail closed", () => {
  test("no parameters yet ⇒ not ready, and get() does NOT fetch", async () => {
    const h = harness();
    const lookup = h.cache.get();
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("never-fetched");
    // The critical property: reading the cache must never cause network I/O,
    // or a validation failure becomes a way to make the batcher call out.
    expect(h.calls.count).toBe(0);
  });

  test("parameters older than maxAge are refused, not served stale", async () => {
    const h = harness({ maxAgeMs: 60_000 });
    await h.cache.refresh();
    expect(h.cache.get().ok).toBe(true);

    h.advance(60_001);
    const lookup = h.cache.get();
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.reason).toBe("stale");
      expect(lookup.ageMs).toBeGreaterThan(60_000);
    }
  });

  test("a failed refresh keeps the last good snapshot until it ages out", async () => {
    // A transient indexer blip should not fail every request immediately —
    // but it must not extend the snapshot's life either.
    let fail = false;
    const h = harness({
      maxAgeMs: 60_000,
      fetch: async () => {
        if (fail) throw new Error("indexer unreachable");
        return blockAt(1);
      },
    });
    await h.cache.refresh();
    fail = true;
    h.advance(30_000);
    await h.cache.refresh();
    expect(h.cache.get().ok).toBe(true); // still inside maxAge

    h.advance(30_001);
    const lookup = h.cache.get();
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.lastError).toContain("indexer unreachable");
  });
});

describe("refresh discipline", () => {
  test("concurrent refreshes are single-flight — one fetch, not N", async () => {
    let resolve!: (b: BlockData) => void;
    const h = harness({ fetch: () => new Promise<BlockData>((r) => { resolve = r; }) });
    const all = [h.cache.refresh(), h.cache.refresh(), h.cache.refresh()];
    resolve(blockAt(1));
    await Promise.all(all);
    expect(h.cache.get().ok).toBe(true);
  });

  test("REGRESSION: refresh is throttled, so failures cannot become a query flood", async () => {
    const h = harness({ minRefreshIntervalMs: 5_000 });
    await h.cache.refresh();
    expect(h.calls.count).toBe(1);

    // An attacker driving validation failures must not translate into one
    // indexer query per request.
    for (let i = 0; i < 20; i++) await h.cache.refresh();
    expect(h.calls.count).toBe(1);

    h.advance(5_001);
    await h.cache.refresh();
    expect(h.calls.count).toBe(2);
  });
});

describe("static fallback is dev-only", () => {
  test("without the flag, an unfetched cache stays closed", () => {
    expect(harness().cache.get().ok).toBe(false);
  });

  test("with the flag, it serves initialParameters and says so in health", () => {
    const h = harness({ allowStaticFallback: true });
    expect(h.cache.get().ok).toBe(true);
    expect(h.cache.health().staticFallback).toBe(true);
  });
});

describe("health is diagnosable", () => {
  test("an un-ready cache reports WHY", async () => {
    const h = harness({ fetch: async () => { throw new Error("ECONNREFUSED"); } });
    await h.cache.refresh();
    const health = h.cache.health();
    expect(health.ready).toBe(false);
    expect(health.reason).toBe("never-fetched");
    // Without this an operator cannot tell "indexer down" from "misconfigured".
    expect(String(health.lastError)).toContain("ECONNREFUSED");
  });

  test("a ready cache reports age and height", async () => {
    const h = harness();
    await h.cache.refresh();
    h.advance(1_234);
    const health = h.cache.health();
    expect(health.ready).toBe(true);
    expect(health.ageMs).toBe(1_234);
    expect(health.height).toBe(1);
  });
});

describe("lifecycle", () => {
  test("close() stops the refresh timer", async () => {
    const h = harness({ minRefreshIntervalMs: 0 });
    h.cache.start();
    await new Promise((r) => setTimeout(r, 5));
    const afterStart = h.calls.count;
    expect(afterStart).toBeGreaterThan(0);

    h.cache.close();
    const afterClose = h.calls.count;
    await new Promise((r) => setTimeout(r, 30));
    // A leaked interval keeps querying the indexer for the life of the process.
    expect(h.calls.count).toBe(afterClose);
  });

  test("start() after close() does not resurrect the timer", async () => {
    const h = harness();
    h.cache.close();
    h.cache.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.calls.count).toBe(0);
  });
});
