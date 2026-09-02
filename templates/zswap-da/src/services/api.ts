// src/services/api.ts
import type {
  KnownToken,
  OfferDetail,
  OffersPage,
  OfferStatusLookup,
} from '../types';
import { API_BASE, BATCHER_URL, BATCHER_TARGET } from '../config';
import { dlog, timed } from '../debug';
import type { PriceSource } from '../state/format';

export type { PriceSource };

/** Every offer route lives under /v1 with MIP-0006 vocabulary. */
const V1 = `${API_BASE}/v1`;

/**
 * Error carrying the node API's machine-readable code.
 *
 * Bodies are always `{error, reason, ...extras}` with a truthful status: 400
 * validation, 404 unknown, 409 duplicate, 429 rate-limited, 500 INTERNAL.
 * Extras (`offerId`, `activeOfferId`, `status`, `hint`, `diagnostics`) survive
 * on `.data`.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data: Record<string, any>;
  constructor(status: number, body: any, fallback: string) {
    super(body?.reason ?? body?.message ?? body?.error ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error ?? `HTTP_${status}`;
    this.data = body && typeof body === 'object' ? body : {};
  }
}

/**
 * Submit failures where the offer can provably never settle. Retrying the same
 * blob is guaranteed to fail again — surface the reason and stop, never loop.
 *
 * ROOT_UNKNOWN is in here deliberately: it used to be treated as transient and
 * retried, but the node now diagnoses it as a wallet/indexer misconfiguration
 * and says so in `hint`. Retrying a foreign root never converges.
 */
export const TERMINAL_SUBMIT_CODES = new Set([
  'BAD_ENCODING',
  'BAD_DESERIALIZE',
  'TOO_LARGE',
  'NOT_A_SWAP',
  'NO_SPENDABLE_INPUT',
  'NULLIFIER_SPENT',
  'UTXO_NOT_LIVE',
  'UTXO_SPENT',
  'UTXO_UNKNOWN',
  'ROOT_UNKNOWN',
  'VALIDATION',
]);

/** Parse a node API response, throwing ApiError with the code on failure. */
async function parse<T>(res: Response, fallback: string): Promise<T> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (proxy error page, gateway timeout) — body stays null */
  }
  if (!res.ok) throw new ApiError(res.status, body, fallback);
  return body as T;
}

/** 64 hex chars. Guards the :offerId path segment client-side. */
const isOfferId = (h: unknown): h is string =>
  typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h);

/** POST /v1/offers/status accepts at most 50 offers per batched request. */
const STATUS_BATCH_MAX = 50;

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
  // ── reference-price fields (kernel 00005 part A) ──────────────────────────
  // OPTIONAL ON PURPOSE: a node that predates the price service (preprod today,
  // and every stack the midnight-1 port runs against until it is redeployed)
  // answers without them. Typing them as required would compile a lie and the
  // UI would read `undefined.toFixed()`. Every consumer must degrade to "no
  // reference known" rather than invent a number.
  /** Sponsorship threshold as a fraction, e.g. 0.025 = 2.5% below reference. */
  sponsor_discount?: number;
  /** Where the price of the token being paid came from. */
  from_source?: PriceSource;
  /** Where the price of the token being received came from. */
  to_source?: PriceSource;
  /** Older of the two token price timestamps; null when either side is demo. */
  prices_updated_at?: string | null;
  /** Pre-existing top-level field: 'token-prices' | 'demo-fallback'. */
  source?: string;
}

/** One row of `GET /v1/prices.assets` — a USD price per coin of a market asset. */
export interface AssetPrice {
  asset_id: string;
  /** Decimal STRING (NUMERIC on the wire) — never parse it for money maths. */
  price_usd: string;
  source: 'feed' | 'seed' | 'fixed';
  provider_updated_at: string | null;
  updated_at: string;
}

/** One row of `GET /v1/prices.tokens` — USD per BASE UNIT of a known token. */
export interface TokenPrice {
  token_color: string;
  name: string;
  kind: 'shielded' | 'unshielded';
  decimals: number;
  asset_id: string | null;
  price_usd: string;
  source: PriceSource;
  updated_at: string;
}

/** `GET /v1/prices.feed` — the price-feed process's last run. All-null when it
 *  has never run (a stack serving only the seeded prices). */
export interface PriceFeedStatus {
  provider: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
}

/** `GET /v1/prices` (master plan §3). */
export interface PricesResponse {
  sponsor_discount: number;
  feed: PriceFeedStatus | null;
  assets: AssetPrice[];
  tokens: TokenPrice[];
}

// NOTE: there is no /v1/chart/depth endpoint — the node serves only
// /v1/chart/{stats,history}. The order book's depth view is derived
// client-side from the live offers (see screens/Market.tsx).
// chart/history is derived from GENUINE FILLS only (consumed, not cancelled),
// so it is sparser than the pre-/v1 series, which counted cancels too.
export interface ChartStats { base: string; quote: string; last: number; change24: number; high: number; low: number; volume_base: number; volume_quote: number }
export interface ChartHistoryRow { price: number; amt: number; up: boolean; at: string }

/** One row from /v1/pairs — pair_stats write-side projection merged with live open count. */
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
    const res = await fetch(`${V1}/known-tokens`);
    return parse(res, 'Failed to fetch known tokens');
  },

  /**
   * Publish an offer. `blob` is the bech32m `swapoffer1…` string produced by
   * MIP-0005 encodeOffer(); the wire field is `offer`.
   *
   * Resolves to `{success, offerId, result}` — persist `offerId` and poll by it.
   * `result` is an internal batcher receipt with no stable shape: ignore it.
   *
   * The offer only appears in `GET /v1/offers` after the Celestia round-trip
   * (seconds to ~a minute), so poll status until it leaves `not_found`.
   *
   * Throws ApiError. `NOT_SPONSORED` (422, kernel 00005 part B) carries the
   * node's `reason` as the error message plus `give_usd` / `want_usd` /
   * `implied_discount` / `sponsor_discount` on `.data`; createOffer rethrows it
   * untouched so the Swap error area shows the reason verbatim.
   * Other notable codes: `DUPLICATE_OFFER` (409, carries the existing
   * `offerId` + `status`) and `DUPLICATE_MARKERS` (409, carries `activeOfferId`
   * of the live offer that owns the same declared markers, plus `offerId` for this
   * attempt) — both are not failures from the user's point of view. Everything in
   * TERMINAL_SUBMIT_CODES, which must never be retried.
   */
  submitSwapOffer: async (
    blob: string,
  ): Promise<{ success: boolean; offerId: string; result: unknown }> => {
    const res = await fetch(`${V1}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: blob }),
    });
    return parse(res, 'Failed to submit offer');
  },

  /**
   * The order book. Keyset-paginated: feed the previous page's `nextCursor`
   * back as `after_hash` until `nextCursor` is null. Query params stay
   * snake_case — only response bodies went camelCase.
   *
   * Rows are blob-free. A 400 `INVALID_CURSOR` means the cursor is stale or
   * fabricated: restart from page one rather than looping.
   */
  getOffers: async (params: {
    limit?: number;
    token?: string;
    direction?: 'GIVING' | 'WANTING';
    after_hash?: string;
  } = {}): Promise<OffersPage> => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const res = await fetch(`${V1}/offers?${q.toString()}`);
    return parse(res, 'Failed to fetch offers');
  },

  /**
   * Full offer including its blob, by content hash — the only endpoint that
   * returns a blob. Archived offers still resolve, with their final status.
   * Fetch lazily on selection; never prefetch for a whole page of the book.
   *
   * Throws ApiError `INVALID_HASH` (400) or `NOT_FOUND` (404).
   */
  getOfferById: async (offerId: string): Promise<OfferDetail> => {
    if (!isOfferId(offerId)) {
      throw new ApiError(400, { error: 'INVALID_HASH', reason: `not a 64-hex offerId: ${offerId}` }, 'Invalid offerId');
    }
    const res = await fetch(`${V1}/offers/${offerId}`);
    return parse(res, 'Failed to fetch offer');
  },

  /** Lightweight status probe by offerId. Preferred whenever you have one. */
  getOfferStatusById: async (offerId: string): Promise<OfferStatusLookup> => {
    if (!isOfferId(offerId)) return 'not_found';
    try {
      const res = await fetch(`${V1}/offers/${offerId}/status`);
      if (res.status === 404) return 'not_found';
      const data = await parse<{ offerId: string; status: OfferStatusLookup }>(res, 'Failed to fetch status');
      return data.status ?? 'not_found';
    } catch {
      return 'not_found';
    }
  },

  getEventsUrl: () => `${V1}/offers/stream`,

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
    const res = await fetch(`${V1}/quote?${p.toString()}`);
    // The node no longer fabricates a rate for tokens it doesn't know:
    // 404 UNKNOWN_TOKEN (not in /v1/known-tokens), 400 VALIDATION (malformed
    // color). Give both a message a user can act on.
    //
    // Everything else — including 422 NOT_SPONSORED — falls through to parse(),
    // which builds an ApiError whose `.message` IS the server's `reason` and
    // keeps the numbers (`give_usd`, `want_usd`, `implied_discount`,
    // `sponsor_discount`) on `.data`. That is what the Swap error area renders,
    // so a refusal explains itself instead of reading "Request failed".
    if (res.status === 404 || res.status === 400) {
      const body = await res.json().catch(() => null);
      if (body?.error === 'UNKNOWN_TOKEN') {
        throw new ApiError(res.status, body, `Token not registered: ${body.token ?? toToken}`);
      }
      throw new ApiError(res.status, body, 'That token pair is not quotable');
    }
    return parse(res, 'Failed to fetch quote');
  },

  /**
   * Reference prices: the sponsorship threshold, the price-feed's last run,
   * every market asset and every priced known token (master plan §3).
   *
   * Prices are decimal STRINGS per base unit. Throws ApiError — a node that
   * predates the price service answers 404, which callers treat as "no
   * reference available" rather than as an error to show.
   */
  getPrices: async (): Promise<PricesResponse> => {
    const res = await fetch(`${V1}/prices`);
    return parse(res, 'Failed to fetch prices');
  },

  getChartStats: async (base: string, quote: string): Promise<ChartStats> => {
    const res = await fetch(`${V1}/chart/stats?base=${base}&quote=${quote}`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },
  getChartHistory: async (base: string, quote: string): Promise<ChartHistoryRow[]> => {
    const res = await fetch(`${V1}/chart/history?base=${base}&quote=${quote}`);
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
    const res = await fetch(`${V1}/midnight/config`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    return data;
  },

  registerKnownToken: async (color: string, name: string, kind: 'shielded' | 'unshielded') => {
    const res = await fetch(`${V1}/known-tokens`, {
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
      const res = await fetch(`${V1}/pairs`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  /**
   * Server-side status for a list of offer blobs, as blob → status.
   *
   * POST because a real blob is 16-25 KB, far past any query-string limit.
   * Batched at 50 to match the endpoint's schema. Prefer getOfferStatusById
   * whenever the offerId is known — this exists for pasted blobs and for
   * My-Trades records that predate id storage.
   */
  fetchTradeStatuses: async (blobs: string[]): Promise<Record<string, OfferStatusLookup | 'unknown'>> => {
    if (blobs.length === 0) return {};
    const out: Record<string, OfferStatusLookup | 'unknown'> = {};
    for (let i = 0; i < blobs.length; i += STATUS_BATCH_MAX) {
      const chunk = blobs.slice(i, i + STATUS_BATCH_MAX);
      try {
        const res = await fetch(`${V1}/offers/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offers: chunk }),
        });
        const data = await parse<{ statuses: { offerId?: string; status: OfferStatusLookup }[] }>(
          res,
          'Failed to fetch statuses',
        );
        // Responses come back in input order and carry no echo of the blob, so
        // indexing is necessarily positional.
        chunk.forEach((blob, idx) => {
          out[blob] = data.statuses?.[idx]?.status ?? 'unknown';
        });
      } catch {
        // Best-effort: an unreachable node leaves these 'unknown' and the
        // caller keeps whatever local status it already had.
        for (const blob of chunk) out[blob] = 'unknown';
      }
    }
    return out;
  },
};
