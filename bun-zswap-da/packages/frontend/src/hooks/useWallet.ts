import { useState, useCallback } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable';

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>(() =>
    window.midnight ? 'disconnected' : 'unavailable'
  );
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletIcon, setWalletIcon] = useState<string | null>(null);
  const [shieldedAddress, setShieldedAddress] = useState<string | null>(null);
  const [unshieldedAddress, setUnshieldedAddress] = useState<string | null>(null);
  const [shieldedBalances, setShieldedBalances] = useState<Record<string, string> | null>(null);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = useCallback(async () => {
    console.log('[wallet] connect: start');

    if (!window.midnight) {
      console.warn('[wallet] connect: window.midnight not present — no extension installed');
      setStatus('unavailable');
      setError('No Midnight wallet extension detected');
      return;
    }

    const entries = Object.entries(window.midnight);
    console.log(`[wallet] connect: found ${entries.length} wallet(s) under window.midnight`,
      entries.map(([uuid, w]) => ({ uuid, rdns: w.rdns, name: w.name, apiVersion: w.apiVersion })));

    if (entries.length === 0) {
      setStatus('unavailable');
      setError('No Midnight wallets available');
      return;
    }

    const [uuid, initialApi] = entries[0];
    console.log(`[wallet] connect: selecting wallet "${initialApi.name}" (rdns=${initialApi.rdns}, uuid=${uuid}, apiVersion=${initialApi.apiVersion})`);
    setStatus('connecting');
    setError(null);

    try {
      console.log('[wallet] connect: calling initialApi.connect("undeployed")…');
      const api = await initialApi.connect('undeployed');
      console.log('[wallet] connect: got ConnectedAPI');

      const config = await api.getConfiguration();
      console.log('[wallet] connect: configuration', config);
      setNetworkId(config.networkId);

      console.log('[wallet] connect: fetching addresses + balances in parallel…');
      const [shielded, unshielded, shBalances] = await Promise.all([
        api.getShieldedAddresses(),
        api.getUnshieldedAddress(),
        api.getShieldedBalances(),
      ]);
      console.log('[wallet] connect: shielded address', shielded.shieldedAddress);
      console.log('[wallet] connect: unshielded address', unshielded.unshieldedAddress);
      console.log('[wallet] connect: shielded balances', shBalances);

      setShieldedAddress(shielded.shieldedAddress);
      setUnshieldedAddress(unshielded.unshieldedAddress);

      const balancesStr: Record<string, string> = {};
      for (const [token, amount] of Object.entries(shBalances)) {
        balancesStr[token] = String(amount);
      }
      setShieldedBalances(balancesStr);

      setWalletName(initialApi.name);
      setWalletIcon(initialApi.icon);
      setConnectedApi(api);
      setStatus('connected');
      console.log('[wallet] connect: done — status=connected');
    } catch (e: any) {
      console.error('[wallet] connect: failed', e);
      setStatus('disconnected');
      setError(e.message || 'Failed to connect wallet');
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    console.log('[wallet] disconnect: clearing state');
    setStatus(window.midnight ? 'disconnected' : 'unavailable');
    setConnectedApi(null);
    setWalletName(null);
    setWalletIcon(null);
    setShieldedAddress(null);
    setUnshieldedAddress(null);
    setShieldedBalances(null);
    setNetworkId(null);
    setError(null);
  }, []);

  return {
    status,
    connectedApi,
    walletName,
    walletIcon,
    shieldedAddress,
    unshieldedAddress,
    shieldedBalances,
    networkId,
    error,
    connectWallet,
    disconnectWallet,
  };
}
