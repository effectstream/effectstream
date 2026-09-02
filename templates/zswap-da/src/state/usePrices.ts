// Reference prices from GET /v1/prices, shared by every screen that needs one.
//
// The feed refreshes once a day, so a 60 s module-level cache is generous; it
// exists so that opening a pair, flipping it and hitting Refresh do not each
// re-fetch the whole token table. One in-flight request is shared by all
// callers mounted at the same time.
//
// A node that predates the price service answers 404. That is "no reference
// available", not an error to put in front of a user, so it resolves to null
// and every consumer falls back to "no reference".

import { useEffect, useState } from 'react';
import { api, type PricesResponse } from '../services/api';

const TTL_MS = 60_000;

let cache: { at: number; data: PricesResponse } | null = null;
let inflight: Promise<PricesResponse | null> | null = null;

/** Drop the cache so the next read hits the node (used by tests). */
export function invalidatePrices(): void {
  cache = null;
}

function loadPrices(): Promise<PricesResponse | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.data);
  if (!inflight) {
    inflight = api
      .getPrices()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * The current reference prices, or null while loading / when the node has no
 * `/v1/prices` route. `refreshKey` re-runs the read (still cache-bounded), so a
 * screen's Refresh button can flow through here.
 */
export function usePrices(refreshKey?: unknown): PricesResponse | null {
  const [prices, setPrices] = useState<PricesResponse | null>(cache?.data ?? null);
  useEffect(() => {
    let cancelled = false;
    loadPrices().then((data) => {
      if (!cancelled && data) setPrices(data);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return prices;
}
