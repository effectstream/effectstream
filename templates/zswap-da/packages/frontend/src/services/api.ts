// src/services/api.ts
import type { KnownToken, ZSwapOffer } from '../types';
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

export const api = {
  getKnownTokens: async (): Promise<KnownToken[]> => {
    const res = await fetch(`${API_BASE}/api/known-tokens`);
    if (!res.ok) throw new Error('Failed to fetch known tokens');
    return res.json();
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

  getZSwaps: async (params: Record<string, string>): Promise<ZSwapOffer[]> => {
    const searchParams = new URLSearchParams(params);
    const res = await fetch(`${API_BASE}/api/zswaps?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch ZSwaps');
    return res.json();
  },

  getEventsUrl: () => `${API_BASE}/api/events`,

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

  registerKnownToken: async (color: string, name: string, kind: 'shielded' | 'unshielded') => {
    const res = await fetch(`${API_BASE}/api/known-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color, name, kind }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },
};
