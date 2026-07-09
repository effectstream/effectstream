// src/services/api.ts
import type { KnownToken, ZSwapOffer } from '../types';
import { API_BASE, BATCHER_URL, BATCHER_TARGET } from '../config';
import { dlog, timed } from '../debug';

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

/** One row from /api/pairs — pair_stats write-side projection merged with live open count. */
export interface PairInfo {
  pair_key: string;
  base_color: string;
  quote_color: string;
  trade_count: number;
  last_price: string | null;
  last_traded_at: string | null;
  open_count: number;
}

const MIDNIGHT_ADDRESS_TYPE = 5;

export async function submitToBatcher(
  serializedTxHex: string,
  txStage: 'unproven' | 'unbound' | 'finalized',
  address: string,
): Promise<{ txHash: string }> {
  const url = `${BATCHER_URL}/send-input`;
  dlog('submitToBatcher: POST', {
    url,
    target: BATCHER_TARGET,
    txStage,
    txBytes: serializedTxHex.length / 2,
    address: `${address.slice(0, 16)}…`,
  });
  const res = await timed(`submitToBatcher: fetch ${url} (wait-receipt, ≤600s)`, () =>
    fetch(url, {
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
        // Preview: balancing (dust proof) + chain inclusion can take 3-5 minutes.
        // 600s gives enough headroom; the batcher's default 300s is too tight.
        timeoutMs: 600_000,
      }),
    }),
  );
  const body = await res.json();
  dlog('submitToBatcher: response', {
    httpStatus: res.status,
    success: body.success,
    transactionHash: body.transactionHash,
    message: body.message,
  });
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

  // blob is the bech32m `swapoffer1…` string produced by MIP-0005 encodeOffer().
  submitSwapOffer: async (blob: string) => {
    const res = await fetch(`${API_BASE}/api/zswap/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.reason ?? data.message ?? JSON.stringify(data)) as Error & { code?: string };
      err.code = data.error;
      throw err;
    }
    return data;
  },

  // ROOT_UNKNOWN is transient: the maker proves against a real chain root, but
  // the sync node may not have ingested it into `known_roots` yet. Re-submitting
  // the same blob succeeds once the root lands (mirrors the e2e suites). Other
  // errors throw immediately.
  submitSwapOfferRetrying: async (
    blob: string,
    opts?: { tries?: number; delayMs?: number; onWait?: (attempt: number, tries: number) => void },
  ) => {
    const tries = opts?.tries ?? 24;
    const delayMs = opts?.delayMs ?? 4000;
    for (let i = 0; ; i++) {
      try {
        return await api.submitSwapOffer(blob);
      } catch (e: any) {
        if (e?.code === 'ROOT_UNKNOWN' && i < tries) {
          opts?.onWait?.(i + 1, tries);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        if (e?.code === 'ROOT_UNKNOWN') {
          throw new Error('The chain has not caught up to your wallet state yet (offer root unknown). Make sure your wallet is fully synced to this network, then try again.');
        }
        throw e;
      }
    }
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

  /** Fetch all known pairs from the write-side projection (pair_stats). */
  fetchPairs: async (): Promise<PairInfo[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/pairs`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  /**
   * Lookup the server-side status for a list of offer blobs.
   * Returns a map of blob → 'open' | 'completed' | 'expired' | 'not_found'.
   * Used for startup-only My Trades reconciliation.
   */
  fetchTradeStatuses: async (blobs: string[]): Promise<Record<string, string>> => {
    if (blobs.length === 0) return {};
    const results = await Promise.all(
      blobs.map(async (blob): Promise<[string, string]> => {
        try {
          const res = await fetch(`${API_BASE}/api/zswap/status?blob=${encodeURIComponent(blob)}`);
          if (!res.ok) return [blob, 'unknown'];
          const data = await res.json();
          return [blob, data.status ?? 'unknown'];
        } catch {
          return [blob, 'unknown'];
        }
      }),
    );
    return Object.fromEntries(results);
  },
};
