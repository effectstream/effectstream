// The /v1/prices cache contract (master plan §3a, Q-11).
//
// The endpoint is a keyed lookup, so the cache must be keyed too: one entry per
// SORTED COLOUR SET, one request per key per TTL, one shared request while a
// key is in flight, and no request at all when there is nothing to ask about.
// The hook itself is React; everything worth pinning is in the two pure
// functions it is built on, so no renderer is needed here.
//
// api.ts imports ../config, which reads `window`/`location` at module load —
// stub them before the dynamic import, as in services/api.test.ts.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

(globalThis as any).window ??= {};
(globalThis as any).location ??= { hostname: 'localhost' };

const { invalidatePrices, loadPrices, pricesKey } = await import('./usePrices');

const A = 'aa'.repeat(32);
const B = 'bb'.repeat(32);

const BODY = {
  sponsor_discount: 0.025,
  feed: { provider: 'coingecko', last_run_at: null, last_ok_at: null, last_error: null },
  assets: [],
  tokens: [
    { token_color: A, name: 'WBTC', kind: 'shielded', decimals: 0, asset_id: 'bitcoin', price_usd: '77387', source: 'feed', updated_at: '2026-09-03T00:00:04.000Z' },
  ],
};

const realFetch = globalThis.fetch;
let calls: string[] = [];

/** Answer every request with BODY after one macrotask, recording the URL. */
function serve(status = 200, body: unknown = BODY) {
  calls = [];
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  invalidatePrices();
  serve();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('pricesKey', () => {
  test('is the sorted, lower-cased, de-duplicated colour set', () => {
    expect(pricesKey([B, A])).toBe(`${A},${B}`);
    expect(pricesKey([A, B])).toBe(pricesKey([B, A]));
    expect(pricesKey([A.toUpperCase(), ` ${A} `])).toBe(A);
  });

  test('is empty when there is nothing to ask about', () => {
    expect(pricesKey([])).toBe('');
    expect(pricesKey(null)).toBe('');
    expect(pricesKey(['', '   ', undefined])).toBe('');
  });
});

describe('loadPrices', () => {
  test('no colours, no request', async () => {
    expect(await loadPrices('')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('asks the node for exactly the key, once, then serves the cache', async () => {
    const key = pricesKey([B, A]);
    const first = await loadPrices(key);
    expect(first?.sponsor_discount).toBe(0.025);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.get('tokens')).toBe(`${A},${B}`);

    await loadPrices(key);
    expect(calls).toHaveLength(1); // still inside the 60 s TTL
  });

  test('concurrent callers on one key share a single request', async () => {
    const key = pricesKey([A, B]);
    const [x, y, z] = await Promise.all([loadPrices(key), loadPrices(key), loadPrices(key)]);
    expect(calls).toHaveLength(1);
    expect(x).toBe(y);
    expect(y).toBe(z);
  });

  test('a different pair is a different entry and does not evict the first', async () => {
    const one = pricesKey([A, B]);
    const two = pricesKey([A]);
    await loadPrices(one);
    await loadPrices(two);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]).searchParams.get('tokens')).toBe(A);
    await loadPrices(one);
    expect(calls).toHaveLength(2); // the pair's entry survived the second key
  });

  test('a node that refuses the query resolves to null, and is retried', async () => {
    serve(400, { error: 'VALIDATION', reason: 'tokens must be 1-50 64-hex colors' });
    const key = pricesKey([A]);
    expect(await loadPrices(key)).toBeNull();
    expect(await loadPrices(key)).toBeNull();
    expect(calls).toHaveLength(2); // a failure is never cached as "no reference"
  });

  test('invalidatePrices drops the cache', async () => {
    const key = pricesKey([A]);
    await loadPrices(key);
    invalidatePrices();
    await loadPrices(key);
    expect(calls).toHaveLength(2);
  });
});
