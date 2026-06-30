// src/hooks/useTokens.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { KnownToken } from '../types';

export function useTokens() {
  const [knownTokens, setKnownTokens] = useState<KnownToken[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const tokens = await api.getKnownTokens();
      setKnownTokens(tokens);
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
