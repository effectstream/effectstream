// The strings the Swap and Market screens show about the reference price
// (project 00005, spec User Story 3 / SC-005). Rendering is trivial once these
// are right, so this is where the behaviour is pinned:
//   - a demo-priced pair is labelled as such and never warned about
//   - a node that predates the price service degrades to "no reference known"
//   - the threshold and the offset carry the node's own numbers, never guesses
import { describe, expect, test } from 'bun:test';
import type { PricesResponse, Quote, TokenPrice } from '../services/api';
import { describeQuote, referenceRate, sourceLabel, tokenPriceOf } from './reference';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');
const HOURS_AGO = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const MINUS = '−';

/** A WBTC→WETH quote at the seeded reference rate, 2.5% below it by default. */
const quote = (over: Partial<Quote> = {}): Quote => ({
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
  sponsor_discount: 0.025,
  from_source: 'feed',
  to_source: 'feed',
  prices_updated_at: HOURS_AGO(3),
  source: 'token-prices',
  ...over,
});

describe('describeQuote — both legs market-backed', () => {
  test('reference, offset, threshold and source line', () => {
    const d = describeQuote(quote(), 'WBTC', 'WETH', NOW);
    expect(d.marketBacked).toBe(true);
    expect(d.referenceRate).toBe(32.336);
    expect(d.offset).toBe(`${MINUS}2.5%`);
    expect(d.offsetBelow).toBe(true);
    expect(d.thresholdText).toBe('sponsored at ≥ 2.5% below reference');
    expect(d.sourceText).toBe('Reference: CoinGecko · 3 h ago');
    expect(d.showNotSponsored).toBe(false);
  });

  test('a seeded price says so, and a mixed pair names both sources', () => {
    expect(describeQuote(quote({ from_source: 'seed', to_source: 'seed' }), 'WBTC', 'WETH', NOW).sourceText)
      .toBe('Reference: CoinGecko snapshot · 3 h ago');
    expect(describeQuote(quote({ from_source: 'feed', to_source: 'fixed' }), 'WBTC', 'USDM', NOW).sourceText)
      .toBe('Reference: CoinGecko + pegged · 3 h ago');
    expect(describeQuote(quote({ from_source: 'manual', to_source: 'manual' }), 'A', 'B', NOW).sourceText)
      .toBe('Reference: operator · 3 h ago');
  });

  test('no timestamp → the source is still named, without an age', () => {
    expect(describeQuote(quote({ prices_updated_at: null }), 'WBTC', 'WETH', NOW).sourceText)
      .toBe('Reference: CoinGecko');
  });

  test('a price above the reference is warned about with the real numbers', () => {
    const d = describeQuote(
      quote({ sponsored: false, discount: 0.01, implied_rate: 32.0126 }),
      'WBTC', 'WETH', NOW,
    );
    expect(d.showNotSponsored).toBe(true);
    expect(d.notSponsoredText).toBe('This price is only 1.0% below reference; sponsorship needs ≥ 2.5%.');
    expect(d.offset).toBe(`${MINUS}1.0%`);
    expect(d.offsetBelow).toBe(true);
  });

  test('at and above the reference read differently', () => {
    expect(describeQuote(quote({ sponsored: false, discount: 0 }), 'A', 'B', NOW).notSponsoredText)
      .toBe('This price is at the reference; sponsorship needs ≥ 2.5% below.');
    const above = describeQuote(
      quote({ sponsored: false, discount: -0.03, implied_rate: 33.306 }),
      'A', 'B', NOW,
    );
    expect(above.notSponsoredText).toBe('This price is 3.0% above reference; sponsorship needs ≥ 2.5% below.');
    expect(above.offset).toBe('+3.0%');
    expect(above.offsetBelow).toBe(false);
  });

  test('a node that omits the threshold gets no invented threshold', () => {
    const d = describeQuote(
      quote({ sponsored: false, discount: 0.01, sponsor_discount: undefined }),
      'WBTC', 'WETH', NOW,
    );
    expect(d.thresholdText).toBeNull();
    expect(d.notSponsoredText).toBeNull();   // caller falls back to the generic sentence
    expect(d.showNotSponsored).toBe(true);
  });
});

describe('describeQuote — demo (unpriced) pairs', () => {
  test('names the unpriced token and suppresses the warning', () => {
    const d = describeQuote(
      quote({ from_source: 'feed', to_source: 'fallback', sponsored: false, source: 'demo-fallback' }),
      'WBTC', 'TESTTOKENA', NOW,
    );
    expect(d.marketBacked).toBe(false);
    expect(d.referenceRate).toBeNull();
    expect(d.offset).toBeNull();
    expect(d.thresholdText).toBeNull();
    expect(d.showNotSponsored).toBe(false);
    expect(d.sourceText).toBe(
      'Demo rate — no market price for TESTTOKENA; test tokens are sponsored regardless',
    );
  });

  test('both sides unpriced names both', () => {
    const d = describeQuote(
      quote({ from_source: 'fallback', to_source: 'demo-fallback', source: 'demo-fallback' }),
      'TESTTOKENA', 'TESTTOKENB', NOW,
    );
    expect(d.sourceText).toBe(
      'Demo rate — no market price for TESTTOKENA and TESTTOKENB; test tokens are sponsored regardless',
    );
  });
});

describe('describeQuote — node without the 00005 fields (preprod today)', () => {
  const legacy = (over: Partial<Quote> = {}) =>
    quote({ sponsor_discount: undefined, from_source: undefined, to_source: undefined, prices_updated_at: undefined, ...over });

  test('token-prices: rate and offset still shown, no source line, no threshold', () => {
    const d = describeQuote(legacy(), 'WBTC', 'WETH', NOW);
    expect(d.marketBacked).toBe(true);
    expect(d.referenceRate).toBe(32.336);
    expect(d.offset).toBe(`${MINUS}2.5%`);
    expect(d.sourceText).toBeNull();
    expect(d.thresholdText).toBeNull();
  });

  test('demo-fallback: labelled as a demo rate for the pair', () => {
    const d = describeQuote(legacy({ source: 'demo-fallback', sponsored: false }), 'WBTC', 'TESTTOKENA', NOW);
    expect(d.marketBacked).toBe(false);
    expect(d.showNotSponsored).toBe(false);
    expect(d.sourceText).toBe(
      'Demo rate — no market price for this pair; test tokens are sponsored regardless',
    );
  });
});

describe('sourceLabel', () => {
  test('market sources are named, the demo price is not', () => {
    expect(sourceLabel('feed')).toBe('CoinGecko');
    expect(sourceLabel('seed')).toBe('CoinGecko snapshot');
    expect(sourceLabel('fixed')).toBe('pegged');
    expect(sourceLabel('manual')).toBe('operator');
    expect(sourceLabel('fallback')).toBeNull();
    expect(sourceLabel('demo-fallback')).toBeNull();
    expect(sourceLabel(undefined)).toBeNull();
  });
});

const token = (over: Partial<TokenPrice> & Pick<TokenPrice, 'token_color' | 'price_usd'>): TokenPrice => ({
  name: 'T', kind: 'shielded', decimals: 0, asset_id: null, source: 'feed', updated_at: HOURS_AGO(1), ...over,
});

const WBTC = 'e7'.repeat(32);
const WETH = 'fd'.repeat(32);
const TESTA = 'aa'.repeat(32);

const prices = (): PricesResponse => ({
  sponsor_discount: 0.025,
  feed: { provider: 'coingecko', last_run_at: HOURS_AGO(1), last_ok_at: HOURS_AGO(1), last_error: null },
  assets: [
    { asset_id: 'bitcoin', price_usd: '77387', source: 'feed', provider_updated_at: HOURS_AGO(1), updated_at: HOURS_AGO(1) },
    { asset_id: 'ethereum', price_usd: '2393.28', source: 'feed', provider_updated_at: HOURS_AGO(1), updated_at: HOURS_AGO(1) },
  ],
  tokens: [
    token({ token_color: WBTC, name: 'WBTC', price_usd: '77387', asset_id: 'bitcoin', updated_at: HOURS_AGO(2) }),
    token({ token_color: WETH, name: 'WETH', price_usd: '2393.28', asset_id: 'ethereum', updated_at: HOURS_AGO(1) }),
    token({ token_color: TESTA, name: 'TESTTOKENA', price_usd: '13.02', source: 'fallback' }),
  ],
});

describe('referenceRate', () => {
  test('1 base = price(base)/price(quote) quote, with the older timestamp', () => {
    const r = referenceRate(prices(), WBTC, WETH)!;
    expect(r.rate).toBeCloseTo(77387 / 2393.28, 9);
    expect(r.label).toBe('CoinGecko');
    expect(r.updatedAt).toBe(HOURS_AGO(2)); // older of the two rows
  });

  test('null when either side is the demo price or unknown', () => {
    expect(referenceRate(prices(), WBTC, TESTA)).toBeNull();
    expect(referenceRate(prices(), TESTA, WETH)).toBeNull();
    expect(referenceRate(prices(), WBTC, 'ff'.repeat(32))).toBeNull();
    expect(referenceRate(null, WBTC, WETH)).toBeNull();
    expect(referenceRate(prices(), null, WETH)).toBeNull();
  });

  test('null on a zero or unparseable price rather than Infinity', () => {
    const p = prices();
    p.tokens[1] = token({ token_color: WETH, name: 'WETH', price_usd: '0' });
    expect(referenceRate(p, WBTC, WETH)).toBeNull();
    p.tokens[1] = token({ token_color: WETH, name: 'WETH', price_usd: 'n/a' });
    expect(referenceRate(p, WBTC, WETH)).toBeNull();
  });

  test('mixed sources are both named', () => {
    const p = prices();
    p.tokens[1] = token({ token_color: WETH, name: 'USDM', price_usd: '0.000001', source: 'fixed' });
    expect(referenceRate(p, WBTC, WETH)!.label).toBe('CoinGecko + pegged');
  });
});

describe('tokenPriceOf', () => {
  test('finds by colour, null otherwise', () => {
    expect(tokenPriceOf(prices(), WBTC)?.name).toBe('WBTC');
    expect(tokenPriceOf(prices(), 'ff'.repeat(32))).toBeNull();
    expect(tokenPriceOf(null, WBTC)).toBeNull();
    expect(tokenPriceOf(prices(), undefined)).toBeNull();
  });
});
