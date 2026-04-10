import { useState, useCallback } from 'react';

type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable';

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>(() =>
    window.midnight ? 'disconnected' : 'unavailable'
  );
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletIcon, setWalletIcon] = useState<string | null>(null);
  const [shieldedAddress, setShieldedAddress] = useState<string | null>(null);
  const [shieldedBalances, setShieldedBalances] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = useCallback(async () => {
    if (!window.midnight) {
      setStatus('unavailable');
      setError('No Midnight wallet extension detected');
      return;
    }

    const wallets = Object.values(window.midnight);
    if (wallets.length === 0) {
      setStatus('unavailable');
      setError('No Midnight wallets available');
      return;
    }

    const initialApi = wallets[0];
    setStatus('connecting');
    setError(null);

    try {
      const connectedApi = await initialApi.connect('testnet');

      const addresses = await connectedApi.getShieldedAddresses();
      setShieldedAddress(addresses.shieldedAddress);

      const balances = await connectedApi.getShieldedBalances();
      const balancesStr: Record<string, string> = {};
      for (const [token, amount] of Object.entries(balances)) {
        balancesStr[token] = String(amount);
      }
      setShieldedBalances(balancesStr);

      setWalletName(initialApi.name);
      setWalletIcon(initialApi.icon);
      setStatus('connected');
    } catch (e: any) {
      setStatus('disconnected');
      setError(e.message || 'Failed to connect wallet');
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setStatus(window.midnight ? 'disconnected' : 'unavailable');
    setWalletName(null);
    setWalletIcon(null);
    setShieldedAddress(null);
    setShieldedBalances(null);
    setError(null);
  }, []);

  return {
    status,
    walletName,
    walletIcon,
    shieldedAddress,
    shieldedBalances,
    error,
    connectWallet,
    disconnectWallet,
  };
}
