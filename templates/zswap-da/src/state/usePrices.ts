// Reference prices from GET /v1/prices, shared by every screen that needs one.
//
// The endpoint is a KEYED lookup, not a table dump (master plan §3a, Q-11): a
// caller asks about the colours it is showing — the Market header asks about
// the selected pair — and the node answers 400 if asked about nothing. So the
// cache is keyed by the SORTED COLOUR SET: {WBTC,WETH} and {WETH,WBTC} are one
// entry, and a different pair is a different entry that never evicts the first.
//
// The feed refreshes once a day, so a 60 s TTL per key is generous; it exists
// so that opening a pair, flipping it and hitting Refresh do not each re-fetch.
// One in-flight request is shared per key by all callers mounted at the time.
//
// A node that predates the price service answers 404, and one that dislikes the
// query answers 400. Both are "no reference available", not an error to put in
// front of a user, so they resolve to null and every consumer falls back to
// "no reference". With no colours to ask about, nothing is fetched at all.

import { useEffect, useState } from 'react';
import { api, normalizeColors, type PricesResponse } from '../services/api';

const TTL_MS = 60_000;

const cache = new Map<string, { at: number; data: PricesResponse }>();
const inflight = new Map<string, Promise<PricesResponse | null>>();

/** The cache key for a set of colours: normalized, sorted, comma-joined.
 *  Empty (falsy) when there is nothing to ask about. */
export function pricesKey(colors: readonly (string | null | undefined)[] | null | undefined): string {
  return normalizeColors(colors ?? []).sort().join(',');
}

/** Drop every cached response so the next read hits the node (used by tests). */
export function invalidatePrices(): void {
  cache.clear();
}

/** The cached response for a key while it is fresh, else null. */
function cachedFor(key: string): PricesResponse | null {
  const hit = key ? cache.get(key) : undefined;
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
}

/**
 * Fetch (or reuse) the prices for one cache key. Exported for tests: it is the
 * whole caching contract — one request per key per TTL, shared while in flight,
 * and no request at all for an empty key.
 */
export function loadPrices(key: string): Promise<PricesResponse | null> {
  if (!key) return Promise.resolve(null);
  const fresh = cachedFor(key);
  if (fresh) return Promise.resolve(fresh);
  let p = inflight.get(key);
  if (!p) {
    p = api
      .getPrices(key.split(','))
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
  }
  return p;
}

/**
 * The reference prices covering `colors`, or null while loading, when there is
 * nothing selected, or when the node has no usable `/v1/prices`. `refreshKey`
 * re-runs the read (still TTL-bounded), so a screen's Refresh button can flow
 * through here.
 */
export function usePrices(
  colors: readonly (string | null | undefined)[] | null | undefined,
  refreshKey?: unknown,
): PricesResponse | null {
  const key = pricesKey(colors);
  const [prices, setPrices] = useState<PricesResponse | null>(() => cachedFor(key));
  useEffect(() => {
    let cancelled = false;
    // Never show one pair's prices under another pair's key.
    setPrices(cachedFor(key));
    if (!key) return;
    loadPrices(key).then((data) => {
      if (!cancelled && data) setPrices(data);
    });
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);
  return prices;
}
