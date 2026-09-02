// The on-device trade log, bucketed per wallet. The "bottom section" of the app
// used to show wallet A's history to wallet B; these cases pin the isolation,
// the legacy read-through, and the fact that mutations find whichever bucket
// holds the record (a legacy row must still be updatable and clearable).
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  addTrade,
  clearTrades,
  listTrades,
  removeTrade,
  setActiveScope,
  subscribeTrades,
  updateTradeStatus,
  type MyTrade,
} from './myTrades';

// Minimal localStorage stand-in — bun's test runtime has no DOM.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

const KEY = 'zswap-da:my-trades';
const W1 = 'preprod::mn_shield-addr_test1aaa';
const W2 = 'preprod::mn_shield-addr_test1bbb';
const stored = () => JSON.parse(mem.get(KEY) ?? '{}');

const trade = (id: string, status: MyTrade['status'] = 'live'): MyTrade => ({
  id,
  kind: 'create',
  give: { sym: 'WETH', amt: 3 },
  get: { sym: 'WBTC', amt: 15 },
  at: 1_700_000_000_000,
  status,
  shielded: true,
});

beforeEach(() => {
  mem.clear();
  // Also drops the module cache, so each test starts from the storage it seeds.
  setActiveScope(null);
});

describe('per-wallet isolation', () => {
  test('a trade is recorded in the active wallet bucket only', () => {
    setActiveScope(W1);
    addTrade(trade('t1'));
    expect(Object.keys(stored())).toEqual([W1]);
    expect(listTrades().map((t) => t.id)).toEqual(['t1']);
  });

  test('the other wallet sees none of it', () => {
    setActiveScope(W1);
    addTrade(trade('t1'));
    setActiveScope(W2);
    expect(listTrades()).toEqual([]);
    addTrade(trade('t2'));
    expect(listTrades().map((t) => t.id)).toEqual(['t2']);
    setActiveScope(W1);
    expect(listTrades().map((t) => t.id)).toEqual(['t1']);
  });

  test('newest first within a bucket', () => {
    setActiveScope(W1);
    addTrade(trade('older'));
    addTrade(trade('newer'));
    expect(listTrades().map((t) => t.id)).toEqual(['newer', 'older']);
  });
});

describe('legacy records (Q-1 option 1)', () => {
  test('a pre-scoping flat array is shown to every wallet, tagged', () => {
    mem.set(KEY, JSON.stringify([trade('old')]));
    setActiveScope(W1);
    const [row] = listTrades();
    expect(row.id).toBe('old');
    expect(row.legacy).toBe(true);
    setActiveScope(W2);
    expect(listTrades()[0].legacy).toBe(true);
  });

  test('the wallet\'s own trades come first, legacy after', () => {
    mem.set(KEY, JSON.stringify([trade('old')]));
    setActiveScope(W1);
    addTrade(trade('mine'));
    expect(listTrades().map((t) => [t.id, !!t.legacy])).toEqual([['mine', false], ['old', true]]);
  });

  test('no wallet connected → legacy only', () => {
    mem.set(KEY, JSON.stringify({ [W1]: [trade('t1')], legacy: [trade('old')] }));
    setActiveScope(null);
    expect(listTrades().map((t) => t.id)).toEqual(['old']);
  });

  test('with no wallet, a trade is not recorded into someone else\'s bucket', () => {
    setActiveScope(null);
    addTrade(trade('t1'));
    expect(mem.has(KEY)).toBe(false);
  });

  test('old status vocabulary is mapped on read', () => {
    mem.set(KEY, JSON.stringify([{ ...trade('old'), status: 'completed' }]));
    setActiveScope(W1);
    expect(listTrades()[0].status).toBe('consumed');
  });

  test('pre-/v1 offerHash is read as offerId', () => {
    mem.set(KEY, JSON.stringify([{ ...trade('old'), offerHash: 'abc123' }]));
    setActiveScope(W1);
    expect(listTrades()[0].offerId).toBe('abc123');
  });
});

describe('mutations find the bucket holding the record', () => {
  test('updateTradeStatus works on the active bucket', () => {
    setActiveScope(W1);
    addTrade(trade('t1', 'not_public'));
    updateTradeStatus('t1', 'live');
    expect(listTrades()[0].status).toBe('live');
  });

  test('updateTradeStatus works on a legacy record', () => {
    mem.set(KEY, JSON.stringify([trade('old', 'live')]));
    setActiveScope(W1);
    updateTradeStatus('old', 'consumed');
    expect(stored().legacy[0].status).toBe('consumed');
  });

  test('an unknown id is a no-op', () => {
    setActiveScope(W1);
    addTrade(trade('t1'));
    updateTradeStatus('nope', 'consumed');
    removeTrade('nope');
    expect(listTrades().map((t) => t.id)).toEqual(['t1']);
  });

  test('removeTrade never touches another wallet\'s bucket', () => {
    mem.set(KEY, JSON.stringify({ [W1]: [trade('t1')], [W2]: [trade('t2')] }));
    setActiveScope(W1);
    removeTrade('t1');
    expect(stored()).toEqual({ [W1]: [], [W2]: [trade('t2')] });
  });
});

describe('clearTrades', () => {
  test('clears what the user can see — active + legacy — and nothing else', () => {
    mem.set(KEY, JSON.stringify({ [W1]: [trade('t1')], [W2]: [trade('t2')], legacy: [trade('old')] }));
    setActiveScope(W1);
    clearTrades();
    expect(stored()).toEqual({ [W2]: [trade('t2')] });
    expect(listTrades()).toEqual([]);
  });
});

describe('subscribers', () => {
  test('fire on write and on a wallet switch', () => {
    let calls = 0;
    const off = subscribeTrades(() => { calls++; });
    setActiveScope(W1);
    expect(calls).toBe(1);
    addTrade(trade('t1'));
    expect(calls).toBe(2);
    // Re-installing the SAME scope is not a change and must not churn the UI.
    setActiveScope(W1);
    expect(calls).toBe(2);
    setActiveScope(W2);
    expect(calls).toBe(3);
    off();
    setActiveScope(W1);
    expect(calls).toBe(3);
  });
});
