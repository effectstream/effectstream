// src/hooks/useZSwapAPI.ts
import { useState, useCallback, useRef } from 'react';
import { api, ApiError } from '../services/api';
import type { ZSwapOffer } from '../types';

/** Server caps `limit` at 100. */
const PAGE_LIMIT = 100;

export function useZSwapAPI() {
  const [offers, setOffers] = useState<ZSwapOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [limit, setLimit] = useState(PAGE_LIMIT);
  const [filterToken, setFilterToken] = useState('');
  const [filterSide, setFilterSide] = useState('any');

  /** Cursor for the NEXT page, or null when the book is fully loaded. */
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** How many pages the user has pulled in. Periodic refreshes re-fetch this
   *  many so a background poll can't silently discard loaded pages. */
  const pageCount = useRef(1);
  // Guards two in-flight loads racing on the same cursor.
  const inFlight = useRef(false);

  const params = useCallback(() => {
    const p: Parameters<typeof api.getOffers>[0] = { limit };
    if (filterToken) p.token = filterToken;
    if (filterSide && filterSide !== 'any') p.direction = filterSide as 'GIVING' | 'WANTING';
    return p;
  }, [limit, filterToken, filterSide]);

  /**
   * Walk `pages` keyset pages from the start and replace the book with them.
   *
   * Re-walking rather than reusing stored cursors is deliberate: it is
   * self-correcting when the book shifts, and keyset pagination is documented
   * as stable under concurrent inserts/archives, so no row is skipped or
   * repeated mid-walk.
   */
  const loadPages = useCallback(
    async (pages: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const acc: ZSwapOffer[] = [];
        let cursor: string | null = null;
        let last: string | null = null;
        for (let i = 0; i < Math.max(1, pages); i++) {
          const page: Awaited<ReturnType<typeof api.getOffers>> = await api.getOffers(
            cursor ? { ...params(), after_hash: cursor } : params(),
          );
          acc.push(...(page.offers ?? []));
          last = page.nextCursor ?? null;
          if (!last) break; // a FULL page can still be the last one
          cursor = last;
        }
        setOffers(acc);
        setNextCursor(last);
        pageCount.current = Math.max(1, pages);
      } catch (err: any) {
        // A stale cursor means the book moved under us; page one is always
        // valid, so fall back to it instead of retrying the same cursor.
        if (err instanceof ApiError && err.code === 'INVALID_CURSOR' && pages > 1) {
          inFlight.current = false;
          setLoading(false);
          await loadPages(1);
          return;
        }
        setError(err?.message || 'Failed to load offers');
        setOffers([]);
        setNextCursor(null);
        pageCount.current = 1;
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [params],
  );

  /** Refresh in place, preserving how many pages are on screen. */
  const fetchOffers = useCallback(() => loadPages(pageCount.current), [loadPages]);

  /** Pull one more page. Explicit — the book never auto-paginates. */
  const loadMore = useCallback(() => {
    if (!nextCursor) return Promise.resolve();
    return loadPages(pageCount.current + 1);
  }, [nextCursor, loadPages]);

  const resetFilters = () => {
    setFilterToken('');
    setFilterSide('any');
    setLimit(PAGE_LIMIT);
    pageCount.current = 1;
  };

  return {
    offers,
    loading,
    error,
    limit, setLimit,
    filterToken, setFilterToken,
    filterSide, setFilterSide,
    fetchOffers,
    /** True while more pages remain. */
    hasMore: nextCursor !== null,
    loadMore,
    resetFilters,
  };
}
