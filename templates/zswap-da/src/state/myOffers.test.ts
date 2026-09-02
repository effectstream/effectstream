// The "is this offer mine?" record, now bucketed per wallet. These cases are
// the regression net for issue 00003: with two wallets in one browser, wallet B
// must NOT inherit wallet A's offers as its own.
import { beforeEach, describe, expect, test } from 'bun:test';
import { addMyOffer, isMyOffer, isMyOfferIn, setActiveScope } from './myOffers';

// Minimal localStorage stand-in — bun's test runtime has no DOM.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

const KEY = 'zswap-da:my-offers';
const W1 = 'preprod::mn_shield-addr_test1aaa';
const W2 = 'preprod::mn_shield-addr_test1bbb';
const stored = () => JSON.parse(mem.get(KEY) ?? '{}');

beforeEach(() => {
  mem.clear();
  // Also drops the module cache, so each test starts from the storage it seeds.
  setActiveScope(null);
});

describe('addMyOffer / isMyOffer', () => {
  test('records into the active wallet bucket', () => {
    setActiveScope(W1);
    addMyOffer('offer-1');
    expect(stored()).toEqual({ [W1]: ['offer-1'] });
    expect(isMyOffer('offer-1')).toBe(true);
  });

  test('another wallet in the same browser does not inherit it (issue 00003)', () => {
    setActiveScope(W1);
    addMyOffer('offer-1');
    setActiveScope(W2);
    expect(isMyOffer('offer-1')).toBe(false);
  });

  test('switching back restores ownership', () => {
    setActiveScope(W1);
    addMyOffer('offer-1');
    setActiveScope(W2);
    addMyOffer('offer-2');
    setActiveScope(W1);
    expect(isMyOffer('offer-1')).toBe(true);
    expect(isMyOffer('offer-2')).toBe(false);
    // Neither wallet's records were clobbered by the other's write.
    expect(stored()).toEqual({ [W1]: ['offer-1'], [W2]: ['offer-2'] });
  });

  test('the same wallet on another network is a different bucket', () => {
    setActiveScope('preprod::w');
    addMyOffer('offer-1');
    setActiveScope('undeployed::w');
    expect(isMyOffer('offer-1')).toBe(false);
  });

  test('duplicate keys are not appended twice', () => {
    setActiveScope(W1);
    addMyOffer('offer-1');
    addMyOffer('offer-1');
    expect(stored()[W1]).toEqual(['offer-1']);
  });

  test('empty/null keys are ignored', () => {
    setActiveScope(W1);
    addMyOffer(null);
    addMyOffer(undefined);
    addMyOffer('');
    expect(isMyOffer(null)).toBe(false);
    expect(isMyOffer('')).toBe(false);
    expect(mem.has(KEY)).toBe(false);
  });
});

describe('no wallet connected (null scope)', () => {
  test('writes are refused rather than landing in someone else\'s bucket', () => {
    setActiveScope(null);
    addMyOffer('offer-1');
    expect(mem.has(KEY)).toBe(false);
  });

  test('nothing is mine — not even another bucket\'s records', () => {
    mem.set(KEY, JSON.stringify({ [W1]: ['offer-1'] }));
    setActiveScope(null);
    expect(isMyOffer('offer-1')).toBe(false);
  });
});

// Q-1, resolved by Eddie: pre-scoping records are DISCARDED, not migrated.
describe('pre-scoping records (no compatibility)', () => {
  test('a pre-scoping flat array is not mine for any wallet', () => {
    mem.set(KEY, JSON.stringify(['old-offer']));
    setActiveScope(W1);
    expect(isMyOffer('old-offer')).toBe(false);
    setActiveScope(W2);
    expect(isMyOffer('old-offer')).toBe(false);
  });

  test('the next write replaces the flat array with a bucket store', () => {
    mem.set(KEY, JSON.stringify(['old-offer']));
    setActiveScope(W1);
    addMyOffer('offer-1');
    expect(stored()).toEqual({ [W1]: ['offer-1'] });
  });

  test('a blob key is a valid key like any other', () => {
    const blob = 'swapoffer1' + 'q'.repeat(64);
    setActiveScope(W1);
    addMyOffer(blob);
    expect(isMyOffer(blob)).toBe(true);
  });
});

describe('isMyOfferIn', () => {
  test('answers for a scope other than the active one (render-time lookup)', () => {
    mem.set(KEY, JSON.stringify({ [W1]: ['offer-1'], [W2]: ['offer-2'] }));
    setActiveScope(W1);
    expect(isMyOfferIn('offer-2', W2)).toBe(true);
    expect(isMyOfferIn('offer-1', W2)).toBe(false);
  });

  test('null scope owns nothing, whatever the active scope is', () => {
    mem.set(KEY, JSON.stringify({ [W1]: ['offer-1'] }));
    setActiveScope(W1);
    expect(isMyOfferIn('offer-1', null)).toBe(false);
  });
});
