// src/hooks/useZSwapAPI.ts
import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { ZSwapOffer } from '../types';

export function useZSwapAPI() {
  const [offers, setOffers] = useState<ZSwapOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [filterToken, setFilterToken] = useState("");
  const [filterSide, setFilterSide] = useState("any");

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        limit: String(limit),
        offset: String(offset),
      };
      if (filterToken) params.token = filterToken;
      if (filterSide && filterSide !== "any") {
        params.direction = filterSide;
      }
      
      const data = await api.getZSwaps(params);
      setOffers(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load offers');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, filterToken, filterSide]);

  const nextPage = () => {
    setOffset(prev => prev + limit);
  };

  const prevPage = () => {
    setOffset(prev => Math.max(0, prev - limit));
  };

  const resetFilters = () => {
    setFilterToken("");
    setFilterSide("any");
    setLimit(100);
    setOffset(0);
  };

  return {
    offers,
    loading,
    error,
    limit, setLimit,
    offset, setOffset,
    filterToken, setFilterToken,
    filterSide, setFilterSide,
    fetchOffers,
    nextPage,
    prevPage,
    resetFilters
  };
}
