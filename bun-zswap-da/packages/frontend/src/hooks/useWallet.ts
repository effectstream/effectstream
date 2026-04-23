import { useState, useCallback, useRef } from 'react';
import type { ConnectedAPI, DAppConnectorAPI } from '@midnight-ntwrk/dapp-connector-api';

type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable';

const NETWORK_ID = 'undeployed';

function isChannelShutdownError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '');
  return /shutdown|can no longer be used/i.test(msg);
}

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

  // Live ConnectedAPI + its pre-connect factory. Stored in refs so the proxy
  // exposed to the app can transparently re-connect when the wallet channel
  // is torn down ("Remote API … was shutdown: object can no longer be used").
  const apiRef = useRef<ConnectedAPI | null>(null);
  const connectorRef = useRef<DAppConnectorAPI | null>(null);
  const proxyRef = useRef<ConnectedAPI | null>(null);

  const ensureProxy = useCallback((): ConnectedAPI => {
    if (proxyRef.current) return proxyRef.current;
    const proxy = new Proxy({} as ConnectedAPI, {
      get: (_t, prop) => {
        return async (...args: any[]) => {
          const current = apiRef.current;
          if (!current) throw new Error('Wallet not connected');
          try {
            return await (current as any)[prop](...args);
          } catch (e) {
            if (!isChannelShutdownError(e) || !connectorRef.current) throw e;
            console.warn(`[wallet] channel shutdown while calling ${String(prop)} — reconnecting and retrying once…`);
            const fresh = await connectorRef.current.connect(NETWORK_ID);
            apiRef.current = fresh;
            return await (fresh as any)[prop](...args);
          }
        };
      },
    });
    proxyRef.current = proxy;
    return proxy;
  }, []);

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
      const api = await initialApi.connect(NETWORK_ID);
      console.log('[wallet] connect: got ConnectedAPI');

      connectorRef.current = initialApi;
      apiRef.current = api;
      const wrapped = ensureProxy();

      const config = await wrapped.getConfiguration();
      console.log('[wallet] connect: configuration', config);
      setNetworkId(config.networkId);

      console.log('[wallet] connect: fetching addresses + balances in parallel…');
      const [shielded, unshielded, shBalances] = await Promise.all([
        wrapped.getShieldedAddresses(),
        wrapped.getUnshieldedAddress(),
        wrapped.getShieldedBalances(),
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

      console.log('[wallet] probe: apiVersion reported by connector =', initialApi.apiVersion);
      console.log('[wallet] probe: typeof api.makeIntent =', typeof (api as any).makeIntent);

      setWalletName(initialApi.name);
      setWalletIcon(initialApi.icon);
      setConnectedApi(wrapped);
      setStatus('connected');
      console.log('[wallet] connect: done — status=connected');
    } catch (e: any) {
      console.error('[wallet] connect: failed', e);
      setStatus('disconnected');
      setError(e.message || 'Failed to connect wallet');
    }
  }, [ensureProxy]);

  const disconnectWallet = useCallback(() => {
    console.log('[wallet] disconnect: clearing state');
    apiRef.current = null;
    connectorRef.current = null;
    proxyRef.current = null;
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
