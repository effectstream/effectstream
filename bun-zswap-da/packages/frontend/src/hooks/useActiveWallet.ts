import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';

const STORAGE_KEY = 'zswap-active-wallet';

export function useActiveWallet() {
  const [wallets, setWallets] = useState<string[]>([]);
  const [activeWallet, setActiveWalletState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'alice';
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/wallets`)
      .then(res => res.json())
      .then(data => {
        setWallets(data.wallets ?? []);
        // If stored wallet is not available, fall back to first
        if (data.wallets && !data.wallets.includes(activeWallet)) {
          setActiveWalletState(data.wallets[0] ?? 'alice');
        }
      })
      .catch(() => setWallets(['alice', 'bob']));
  }, []);

  const setActiveWallet = useCallback((id: string) => {
    setActiveWalletState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { wallets, activeWallet, setActiveWallet };
}
