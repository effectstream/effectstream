// src/hooks/useTokens.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DEFAULT_DECIMALS } from '../state/amount';
import type { KnownToken } from '../types';

/**
 * One registry row, with `decimals` guaranteed.
 *
 * A node older than kernel 00024 serves `known_tokens` without the field (the
 * live preprod API still does), and a row could in principle carry junk. Every
 * screen reads whole coins off this number, so it is normalised ONCE here
 * rather than defaulted at each of the dozen render sites.
 */
function normalize(t: KnownToken): KnownToken {
  const d = Number((t as Partial<KnownToken>).decimals);
  return {
    ...t,
    decimals: Number.isFinite(d) && d >= 0 ? Math.trunc(d) : DEFAULT_DECIMALS,
  };
}

export function useTokens() {
  const [knownTokens, setKnownTokens] = useState<KnownToken[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const tokens = await api.getKnownTokens();
      setKnownTokens(tokens.map(normalize));
    } catch (e) {
      console.error("Failed to load known tokens", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  return { knownTokens, loading, refetchTokens: fetchTokens };
}
