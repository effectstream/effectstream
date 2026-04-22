// src/services/api.ts
import type { KnownToken, ZSwapOffer, TokenEntry } from '../types';
import { API_BASE } from '../config';

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
};
