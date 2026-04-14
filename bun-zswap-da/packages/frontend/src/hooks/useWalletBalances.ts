import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

interface WalletBalances {
  shielded: Record<string, string>;
  unshielded: Record<string, string>;
}

export function useWalletBalances(activeWallet: string | undefined, refreshTrigger: number) {
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchBalances = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWalletBalance(activeWallet);
      if (id === requestId.current) {
        setBalances(data);
      }
    } catch (err: any) {
      if (id === requestId.current) {
        setError(err.message ?? 'Failed to fetch balances');
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [activeWallet]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshTrigger]);

  return { balances, loading, error, refetch: fetchBalances };
}
