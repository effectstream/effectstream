// api.ts against the master-plan §3 fixtures (project 00005).
//
// What is actually being pinned here is the ERROR path: a 422 NOT_SPONSORED
// must reach the Swap screen as the node's own `reason` (with the numbers on
// `.data`), not as a generic "Failed to submit offer". The happy paths double
// as a parse check for the new /v1/prices and /v1/quote fields.
//
// api.ts imports ../config, which reads `window` and `location` at module load,
// so the browser globals are stubbed before the dynamic import below. Bun's
// test runtime has no DOM.
import { afterEach, describe, expect, test } from 'bun:test';

(globalThis as any).window ??= {};
(globalThis as any).location ??= { hostname: 'localhost' };

const { api, ApiError } = await import('./api');
import type { PricesResponse, Quote } from './api';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Serve one JSON body for every request, and record the URL that was asked for. */
function serve(status: number, body: unknown) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

// Master plan §3, verbatim shapes.
const PRICES_FIXTURE = {
  sponsor_discount: 0.025,
  feed: {
    provider: 'coingecko',
    last_run_at: '2026-09-03T00:00:00.000Z',
    last_ok_at: '2026-09-03T00:00:04.000Z',
    last_error: null,
  },
  assets: [
    { asset_id: 'bitcoin', price_usd: '77387', source: 'feed', provider_updated_at: '2026-09-02T16:25:50.000Z', updated_at: '2026-09-03T00:00:04.000Z' },
    { asset_id: 'usdm', price_usd: '1', source: 'fixed', provider_updated_at: null, updated_at: '2026-09-03T00:00:04.000Z' },
  ],
  tokens: [
    { token_color: 'e7'.repeat(32), name: 'WBTC', kind: 'shielded', decimals: 0, asset_id: 'bitcoin', price_usd: '77387', source: 'feed', updated_at: '2026-09-03T00:00:04.000Z' },
    { token_color: 'aa'.repeat(32), name: 'TESTTOKENA', kind: 'shielded', decimals: 0, asset_id: null, price_usd: '13.02', source: 'fallback', updated_at: '2026-09-01T10:00:00.000Z' },
  ],
};

const QUOTE_FIXTURE = {
  from_token: 'e7'.repeat(32),
  to_token: 'fd'.repeat(32),
  from_amount: '1000',
  market_rate: 32.336,
  suggested_to_amount: '31527',
  to_amount: '31527',
  implied_rate: 31.527,
  discount: 0.025,
  sponsored: true,
  from_usd: 77387000,
  to_usd: 75452325,
  source: 'token-prices',
  sponsor_discount: 0.025,
  from_source: 'feed',
  to_source: 'feed',
  prices_updated_at: '2026-09-03T00:00:04.000Z',
};

describe('getPrices', () => {
  const WBTC = 'e7'.repeat(32);
  const WETH = 'fd'.repeat(32);

  test('parses the §3 body and asks /v1/prices for exactly the colours given', async () => {
    const calls = serve(200, PRICES_FIXTURE);
    const p: PricesResponse = await api.getPrices([WBTC, WETH]);
    const url = new URL(calls[0]);
    expect(url.pathname.endsWith('/v1/prices')).toBe(true);
    expect(url.searchParams.get('tokens')).toBe(`${WBTC},${WETH}`);
    expect(p.sponsor_discount).toBe(0.025);
    expect(p.feed?.provider).toBe('coingecko');
    expect(p.assets).toHaveLength(2);
    expect(p.tokens[0].price_usd).toBe('77387'); // stays a string
    expect(p.tokens[1].source).toBe('fallback');
  });

  test('colours are lower-cased and de-duplicated in the query', async () => {
    const calls = serve(200, PRICES_FIXTURE);
    await api.getPrices([WBTC.toUpperCase(), ` ${WBTC} `, WETH]);
    expect(new URL(calls[0]).searchParams.get('tokens')).toBe(`${WBTC},${WETH}`);
  });

  // §3a: `tokens` is REQUIRED and the node answers 400 without it. Never send
  // the unfiltered form — refuse it here, with a message that says why.
  test('an empty list is refused client-side, with no request', async () => {
    const calls = serve(200, PRICES_FIXTURE);
    await expect(api.getPrices([])).rejects.toThrow('at least one token color');
    await expect(api.getPrices(['', '  '])).rejects.toThrow('at least one token color');
    expect(calls).toHaveLength(0);
  });

  test('more than 50 colours is refused client-side, with no request', async () => {
    const calls = serve(200, PRICES_FIXTURE);
    const many = Array.from({ length: 51 }, (_, i) => i.toString(16).padStart(64, '0'));
    expect(many).toHaveLength(51);
    await expect(api.getPrices(many)).rejects.toThrow('at most 50 token colors');
    expect(calls).toHaveLength(0);
  });

  test('a node without the route throws ApiError 404, not a parse crash', async () => {
    serve(404, { error: 'NOT_FOUND', reason: 'Route GET /v1/prices not found' });
    await expect(api.getPrices([WBTC])).rejects.toThrow('Route GET /v1/prices not found');
  });

  test('a rejected query throws ApiError 400 with the node reason', async () => {
    serve(400, { error: 'VALIDATION', reason: 'tokens must be 1-50 64-hex colors' });
    const err = await api.getPrices([WBTC]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('tokens must be 1-50 64-hex colors');
  });
});

describe('getQuote', () => {
  test('carries the new reference fields through', async () => {
    const calls = serve(200, QUOTE_FIXTURE);
    const q: Quote = await api.getQuote('e7'.repeat(32), 'fd'.repeat(32), '1000');
    expect(calls[0]).toContain('/v1/quote?');
    expect(q.sponsor_discount).toBe(0.025);
    expect(q.from_source).toBe('feed');
    expect(q.to_source).toBe('feed');
    expect(q.prices_updated_at).toBe('2026-09-03T00:00:04.000Z');
    expect(q.source).toBe('token-prices');
  });

  test('an older node without them still parses (fields undefined)', async () => {
    const { sponsor_discount, from_source, to_source, prices_updated_at, ...legacy } = QUOTE_FIXTURE;
    serve(200, legacy);
    const q = await api.getQuote('e7'.repeat(32), 'fd'.repeat(32), '1000');
    expect(q.market_rate).toBe(32.336);
    expect(q.sponsor_discount).toBeUndefined();
    expect(q.from_source).toBeUndefined();
  });

  test('422 surfaces the node reason and keeps the numbers', async () => {
    serve(422, {
      error: 'NOT_SPONSORED',
      reason: 'wants 1.0% below reference, sponsorship needs ≥ 2.5%',
      give_usd: 30656.1,
      want_usd: 30349.5,
      implied_discount: 0.01,
      sponsor_discount: 0.025,
    });
    const err = await api.getQuote('e7'.repeat(32), 'fd'.repeat(32), '1000', '31000').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('NOT_SPONSORED');
    expect(err.message).toBe('wants 1.0% below reference, sponsorship needs ≥ 2.5%');
    expect(err.data.implied_discount).toBe(0.01);
  });

  test('404 UNKNOWN_TOKEN keeps its actionable message', async () => {
    serve(404, { error: 'UNKNOWN_TOKEN', reason: 'token not registered', token: 'aa' });
    const err = await api.getQuote('e7'.repeat(32), 'aa', '1000').catch((e) => e);
    expect(err.code).toBe('UNKNOWN_TOKEN');
  });
});

describe('submitSwapOffer', () => {
  test('422 NOT_SPONSORED reaches the caller as the node reason, not "Failed to submit offer"', async () => {
    serve(422, {
      error: 'NOT_SPONSORED',
      reason: 'wants 1.0% below reference, sponsorship needs ≥ 2.5%',
      give_usd: 30656.1,
      want_usd: 30349.5,
      implied_discount: 0.01,
      sponsor_discount: 0.025,
    });
    const err = await api.submitSwapOffer('swapoffer1fixture').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NOT_SPONSORED');
    // This is the string the Swap error area renders verbatim (createOffer
    // rethrows anything that is not a duplicate / ROOT_UNKNOWN).
    expect(err.message).toBe('wants 1.0% below reference, sponsorship needs ≥ 2.5%');
    expect(err.data.sponsor_discount).toBe(0.025);
    expect(err.status).toBe(422);
  });

  test('a body with no reason still falls back to a readable message', async () => {
    serve(500, null);
    const err = await api.submitSwapOffer('swapoffer1fixture').catch((e) => e);
    expect(err.message).toBe('Failed to submit offer');
    expect(err.code).toBe('HTTP_500');
  });
});
