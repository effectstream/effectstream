import { describe, expect, test } from 'bun:test';
import { marketOrderSide, marketReferenceRates, type MarketOrderIdentity, type MarketPairIdentity } from './marketIdentity';

const A = 'aa'.repeat(32);
const B = 'bb'.repeat(32);
const shielded: MarketOrderIdentity = {
  fromColor: A,
  toColor: B,
  fromKind: 'shielded',
  toKind: 'shielded',
};

describe('market pair identity', () => {
  test('matches direction by colors and privacy kinds, independent of labels', () => {
    const pair: MarketPairIdentity = {
      baseColor: A,
      quoteColor: B,
      baseKind: 'shielded',
      quoteKind: 'shielded',
    };
    expect(marketOrderSide(shielded, pair)).toBe('ask');
    expect(marketOrderSide({ ...shielded, fromColor: B, toColor: A }, pair)).toBe('bid');
  });

  test('same colors under opposite privacy never enter the selected book', () => {
    const pair: MarketPairIdentity = {
      baseColor: A,
      quoteColor: B,
      baseKind: 'shielded',
      quoteKind: 'shielded',
    };
    expect(marketOrderSide({ ...shielded, fromKind: 'unshielded', toKind: 'unshielded' }, pair)).toBeNull();
  });

  test('a selected historical color pair stays non-actionable when live orders arrive', () => {
    const historical: MarketPairIdentity = { baseColor: A, quoteColor: B };
    expect(marketOrderSide(shielded, historical)).toBeNull();
    expect(marketOrderSide({ ...shielded, fromKind: 'unshielded', toKind: 'unshielded' }, historical)).toBeNull();
  });

  test('historical display and live mid comparison keep their own decimal scales', () => {
    const rates = marketReferenceRates(
      2,
      { base: 6, quote: 6 },
      { base: 6, quote: 18 },
    );
    expect(rates.historical).toBe(2);
    expect(rates.live).toBeCloseTo(2e-12, 24);
    expect(marketReferenceRates(2, { base: 6, quote: 6 }).live).toBeNull();
  });
});
