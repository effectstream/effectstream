// src/services/api.ts
import type { KnownToken, ZSwapOffer, TokenEntry } from '../types';
import { API_BASE, BATCHER_URL, BATCHER_TARGET } from '../config';

const MIDNIGHT_ADDRESS_TYPE = 5;

export async function submitToBatcher(
  serializedTxHex: string,
  txStage: 'unproven' | 'unbound' | 'finalized',
  address: string,
): Promise<{ txHash: string }> {
  const res = await fetch(`${BATCHER_URL}/send-input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        address,
        addressType: MIDNIGHT_ADDRESS_TYPE,
        input: JSON.stringify({ tx: serializedTxHex, txStage }),
        timestamp: new Date().toISOString(),
        target: BATCHER_TARGET,
      },
      confirmationLevel: 'wait-receipt',
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`Batcher error: ${body.message ?? res.statusText}`);
  }
  return { txHash: body.transactionHash ?? '' };
}

function walletQuery(wallet?: string): string {
  return wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
}

export const api = {
  getKnownTokens: async (): Promise<KnownToken[]> => {
    const res = await fetch(`${API_BASE}/api/known-tokens`);
    if (!res.ok) throw new Error('Failed to fetch known tokens');
    return res.json();
  },

  mintToken: async (type: 'shielded' | 'unshielded', payload: any, wallet?: string) => {
    const endpoint = type === 'shielded' ? '/api/token/mint-shielded' : '/api/token/mint-unshielded';
    const res = await fetch(`${API_BASE}${endpoint}${walletQuery(wallet)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  createSwapOffer: async (
    gives: TokenEntry[],
    wants: TokenEntry[],
    wallet?: string,
  ): Promise<{ success: boolean; transactionBytes: string }> => {
    const res = await fetch(`${API_BASE}/api/zswap/create${walletQuery(wallet)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gives, wants }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create swap offer');
    return data;
  },

  // blob is the bech32m `zswapoffer1…` string produced by mip-zswap-offer.encodeOffer().
  submitSwapOffer: async (blob: string) => {
    const res = await fetch(`${API_BASE}/api/zswap/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  completeOffer: async (id: number, wallet?: string) => {
    const res = await fetch(`${API_BASE}/api/zswap/${id}/complete${walletQuery(wallet)}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  getZSwaps: async (params: Record<string, string>): Promise<ZSwapOffer[]> => {
    const searchParams = new URLSearchParams(params);
    const res = await fetch(`${API_BASE}/api/zswaps?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch ZSwaps');
    return res.json();
  },

  getWalletBalance: async (wallet?: string) => {
    const res = await fetch(`${API_BASE}/api/wallet/balance${walletQuery(wallet)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? 'Failed to fetch balance');
    return data;
  },

  getEventsUrl: () => `${API_BASE}/api/events`,

  requestFaucet: async (recipientAddress: string): Promise<{ success: boolean; txId: string; amount: string; recipient: string }> => {
    const res = await fetch(`${API_BASE}/api/faucet/night`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientAddress }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  getMidnightConfig: async (): Promise<{
    contractAddress: string;
    indexerUri: string;
    indexerWsUri: string;
    proofServerUri: string;
    networkId: string;
  }> => {
    const res = await fetch(`${API_BASE}/api/midnight/config`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  registerKnownToken: async (color: string, name: string) => {
    const res = await fetch(`${API_BASE}/api/known-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },
};
