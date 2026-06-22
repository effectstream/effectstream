// src/services/api.ts
import type { KnownToken, ZSwapOffer } from '../types';
import { API_BASE, BATCHER_URL, BATCHER_TARGET } from '../config';

export interface Quote {
  from_token: string;
  to_token: string;
  from_amount: string;
  market_rate: number;
  suggested_to_amount: string;
  to_amount: string;
  implied_rate: number | null;
  discount: number | null;
  sponsored: boolean;
  from_usd: number;
  to_usd: number | null;
}

export interface ChartDepthRow { price: number; amt: number; total: number }
export interface ChartDepth { mid: number; asks: ChartDepthRow[]; bids: ChartDepthRow[]; maxTotal: number; spread: number }
export interface ChartStats { base: string; quote: string; last: number; change24: number; high: number; low: number; volume_base: number; volume_quote: number }
export interface ChartHistoryRow { price: number; amt: number; up: boolean; at: string }

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

  // Synthetic price quote (see node/market-mock.ts). `toAmount` optional — when
  // set, discount/sponsored are computed against that custom receive amount.
  getQuote: async (
    fromToken: string,
    toToken: string,
    fromAmount: string,
    toAmount?: string,
  ): Promise<Quote> => {
    const p = new URLSearchParams({ from_token: fromToken, to_token: toToken, from_amount: fromAmount });
    if (toAmount != null && toAmount !== '') p.set('to_amount', toAmount);
    const res = await fetch(`${API_BASE}/api/quote?${p.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch quote');
    return res.json();
  },

  getChartStats: async (base: string, quote: string): Promise<ChartStats> => {
    const res = await fetch(`${API_BASE}/api/chart/stats?base=${base}&quote=${quote}`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },
  getChartDepth: async (base: string, quote: string): Promise<ChartDepth> => {
    const res = await fetch(`${API_BASE}/api/chart/depth?base=${base}&quote=${quote}`);
    if (!res.ok) throw new Error('Failed to fetch depth');
    return res.json();
  },
  getChartHistory: async (base: string, quote: string): Promise<ChartHistoryRow[]> => {
    const res = await fetch(`${API_BASE}/api/chart/history?base=${base}&quote=${quote}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
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
