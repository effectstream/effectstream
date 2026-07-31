import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  connectBrowserContract,
  type ConnectedOfferFilesContract,
  type FoundOfferFilesContract,
  type MidnightBrowserConfig,
} from '../services/browserContract';
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format';
import { api } from '../services/api';
import { enqueueMintName, removeMintName } from '../services/mintQueue';

export interface BrowserMintResult {
  color: string;
  txHash: string;
}

export function useContract(connectedApi: ConnectedAPI | null) {
  const [config, setConfig] = useState<MidnightBrowserConfig | null>(null);
  const [connected, setConnected] = useState<ConnectedOfferFilesContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<ConnectedOfferFilesContract> | null>(null);

  // Reset when the wallet connection drops.
  useEffect(() => {
    if (!connectedApi) {
      setConnected(null);
      setConfig(null);
      inflight.current = null;
    }
  }, [connectedApi]);

  const ensureConnected = useCallback(async (): Promise<ConnectedOfferFilesContract> => {
    if (!connectedApi) throw new Error('Browser wallet is not connected');
    if (connected) return connected;
    if (inflight.current) return inflight.current;

    setLoading(true);
    setError(null);
    const promise = (async () => {
      console.log('[useContract] fetching /v1/midnight/config');
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
      const result = await connectBrowserContract(connectedApi, cfg);
      setConnected(result);
      return result;
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
  }, [connectedApi, connected]);

  const ensureContract = useCallback(async (): Promise<FoundOfferFilesContract> => {
    return (await ensureConnected()).contract;
  }, [ensureConnected]);

  const tryRegister = useCallback(async (
    color: string,
    name: string,
    kind: 'shielded' | 'unshielded',
    queuedId: string,
  ) => {
    try {
      await api.registerKnownToken(color, name, kind);
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
      await tryRegister(color, name, 'shielded', queued.id);
      return { color, txHash };
    },
    [ensureContract, tryRegister],
  );

  // Decode Lace's bech32m unshielded address (e.g. "mn_addr_<network>1...") into
  // the raw 32-byte form the compact `UserAddress` parameter expects.
  const resolveRecipientBytes = useCallback(async (): Promise<Uint8Array> => {
    if (!connectedApi) throw new Error('Browser wallet is not connected');
    const cfg = config ?? (await api.getMidnightConfig());
    const { unshieldedAddress } = await connectedApi.getUnshieldedAddress();
    const parsed = MidnightBech32m.parse(unshieldedAddress);
    const decoded = parsed.decode(UnshieldedAddress, cfg.networkId as any);
    return new Uint8Array(decoded.data);
  }, [connectedApi, config]);

  const mintUnshielded = useCallback(
    async (
      domainSepBytes: Uint8Array,
      amount: bigint,
      name: string,
    ): Promise<BrowserMintResult> => {
      const c = await ensureContract();
      const queued = enqueueMintName(name);
      const recipientBytes = await resolveRecipientBytes();
      console.log('[useContract] callTx.mint_unshielded', { amount });
      const txData: any = await (c as any).callTx.mint_unshielded(
        domainSepBytes,
        amount,
        { bytes: recipientBytes },
      );
      const colorBytes = txData.private?.result as Uint8Array | undefined;
      if (!colorBytes) throw new Error('mint_unshielded: missing color in result');
      const color = Array.from(colorBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const txHash: string = txData.public?.txHash ?? '';
      await tryRegister(color, name, 'unshielded', queued.id);
      return { color, txHash };
    },
    [ensureContract, resolveRecipientBytes, tryRegister],
  );

  return {
    config,
    contract: connected?.contract ?? null,
    loading,
    error,
    ensureContract,
    mintShielded,
    mintUnshielded,
  };
}
