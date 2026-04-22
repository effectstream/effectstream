import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';

const STORAGE_KEY = 'zswap-active-wallet';

export const BROWSER_WALLET_ID = 'browser';

export function useActiveWallet(browserAvailable: boolean = false) {
  const [backendWallets, setBackendWallets] = useState<string[]>([]);
  const [activeWallet, setActiveWalletState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'alice';
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/wallets`)
      .then(res => res.json())
      .then(data => {
        setBackendWallets(data.wallets ?? []);
      })
      .catch(() => setBackendWallets(['alice', 'bob']));
  }, []);

  const wallets = browserAvailable
    ? [...backendWallets, BROWSER_WALLET_ID]
    : backendWallets;

  // If selected wallet is 'browser' but the extension disconnected, fall back
  // to the first backend wallet so downstream calls don't silently 404.
  useEffect(() => {
    if (activeWallet === BROWSER_WALLET_ID && !browserAvailable && backendWallets.length > 0) {
      setActiveWalletState(backendWallets[0]);
    } else if (backendWallets.length > 0 && activeWallet !== BROWSER_WALLET_ID && !backendWallets.includes(activeWallet)) {
      setActiveWalletState(backendWallets[0]);
    }
  }, [activeWallet, backendWallets, browserAvailable]);

  const setActiveWallet = useCallback((id: string) => {
    setActiveWalletState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { wallets, activeWallet, setActiveWallet };
}
