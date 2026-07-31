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
  // Guards against two in-flight loadMore() calls racing on the same cursor.
  const loadingMore = useRef(false);

  const params = useCallback(() => {
    const p: Parameters<typeof api.getOffers>[0] = { limit };
    if (filterToken) p.token = filterToken;
    if (filterSide && filterSide !== 'any') p.direction = filterSide as 'GIVING' | 'WANTING';
    return p;
  }, [limit, filterToken, filterSide]);

  /** (Re)load page one, discarding any pagination state. */
  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getOffers(params());
      setOffers(page.offers ?? []);
      setNextCursor(page.nextCursor ?? null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load offers');
      setOffers([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  /**
   * Append the next keyset page. No-op once nextCursor is null — note a FULL
   * page can still be the last one, so the cursor is the only stop signal.
   *
   * A stale/fabricated cursor returns 400 INVALID_CURSOR; that means the book
   * shifted underneath us, so restart from page one rather than looping.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore.current) return;
    loadingMore.current = true;
    setLoading(true);
    try {
      const page = await api.getOffers({ ...params(), after_hash: nextCursor });
      setOffers((prev) => [...prev, ...(page.offers ?? [])]);
      setNextCursor(page.nextCursor ?? null);
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'INVALID_CURSOR') {
        setNextCursor(null);
        loadingMore.current = false;
        setLoading(false);
        await fetchOffers();
        return;
      }
      setError(err?.message || 'Failed to load more offers');
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, [nextCursor, params, fetchOffers]);

  const resetFilters = () => {
    setFilterToken('');
    setFilterSide('any');
    setLimit(PAGE_LIMIT);
    setNextCursor(null);
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
