import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  connectBrowserContract,
  type FoundOfferFilesContract,
  type MidnightBrowserConfig,
} from '../services/browserContract';
import { api } from '../services/api';
import { enqueueMintName, removeMintName } from '../services/mintQueue';

export interface BrowserMintResult {
  color: string;
  txHash: string;
}

export function useContract(connectedApi: ConnectedAPI | null) {
  const [config, setConfig] = useState<MidnightBrowserConfig | null>(null);
  const [contract, setContract] = useState<FoundOfferFilesContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<FoundOfferFilesContract> | null>(null);

  // Reset when the wallet connection drops.
  useEffect(() => {
    if (!connectedApi) {
      setContract(null);
      setConfig(null);
      inflight.current = null;
    }
  }, [connectedApi]);

  const ensureContract = useCallback(async (): Promise<FoundOfferFilesContract> => {
    if (!connectedApi) throw new Error('Browser wallet is not connected');
    if (contract) return contract;
    if (inflight.current) return inflight.current;

    setLoading(true);
    setError(null);
    const promise = (async () => {
      console.log('[useContract] fetching /api/midnight/config');
      const cfg = await api.getMidnightConfig();
      setConfig(cfg);
      const walletStatus = await connectedApi.getConnectionStatus();
      if (walletStatus.status !== 'connected') {
        throw new Error('Browser wallet is not connected');
      }
      if (walletStatus.networkId !== cfg.networkId) {
        throw new Error(
          `Network mismatch: wallet is on "${walletStatus.networkId}", backend expects "${cfg.networkId}"`,
        );
      }
      console.log('[useContract] connecting OfferFiles contract via browser wallet');
      const found = await connectBrowserContract(connectedApi, cfg);
      setContract(found);
      return found;
    })();

    inflight.current = promise;
    try {
      return await promise;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    } finally {
      setLoading(false);
      inflight.current = null;
    }
  }, [connectedApi, contract]);

  const tryRegister = useCallback(async (color: string, name: string, queuedId: string) => {
    try {
      await api.registerKnownToken(color, name);
      removeMintName(queuedId);
    } catch (e: any) {
      // Leave the entry in the queue — the reconciler will retry when it
      // detects the color landing in the wallet's balances.
      console.warn('[useContract] immediate register failed, leaving in queue', e?.message ?? e);
    }
  }, []);

  const mintShielded = useCallback(
    async (
      domainSepBytes: Uint8Array,
      amount: bigint,
      nonce: bigint,
      name: string,
    ): Promise<BrowserMintResult> => {
      const c = await ensureContract();
      const queued = enqueueMintName(name);
      console.log('[useContract] callTx.mint_shielded', { amount, nonce });
      const txData: any = await (c as any).callTx.mint_shielded(domainSepBytes, amount, nonce);
      const colorBytes = txData.private?.result?.color as Uint8Array | undefined;
      if (!colorBytes) throw new Error('mint_shielded: missing color in result');
      const color = Array.from(colorBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const txHash: string = txData.public?.txHash ?? '';
      await tryRegister(color, name, queued.id);
      return { color, txHash };
    },
    [ensureContract, tryRegister],
  );

  const mintUnshielded = useCallback(
    async (
      domainSepBytes: Uint8Array,
      amount: bigint,
      name: string,
    ): Promise<BrowserMintResult> => {
      const c = await ensureContract();
      const queued = enqueueMintName(name);
      console.log('[useContract] callTx.mint_unshielded', { amount });
      const txData: any = await (c as any).callTx.mint_unshielded(domainSepBytes, amount);
      const colorBytes = txData.private?.result as Uint8Array | undefined;
      if (!colorBytes) throw new Error('mint_unshielded: missing color in result');
      const color = Array.from(colorBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const txHash: string = txData.public?.txHash ?? '';
      await tryRegister(color, name, queued.id);
      return { color, txHash };
    },
    [ensureContract, tryRegister],
  );

  return { config, contract, loading, error, ensureContract, mintShielded, mintUnshielded };
}
