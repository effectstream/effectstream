// Per-offer selection inside a take: totals, the aggregate affordability
// verdict, the CTA and what starts checked. A price level used to be
// all-or-nothing; these cases pin the arithmetic the checkboxes drive.
import { describe, expect, test } from 'bun:test';
import type { ParsedLeg } from './offerParse';
import type { KnownToken } from '../types';
import { affordableSelection, defaultSelection, summarize, type SelectableOffer } from './takeSelection';

const WETH = 'aa'.repeat(32);
const known: KnownToken[] = [{ token_color: WETH, name: 'WETH', kind: 'shielded' } as KnownToken];
const leg = (amount: bigint): ParsedLeg => ({ color: WETH, kind: 'shielded', amount });

/** Taker pays `cost` WETH and receives `gets` WBTC — the shape of one book row. */
const offer = (id: string, cost: number, gets: number, mine = false): SelectableOffer => ({
  id,
  pay: { sym: 'WETH', amt: cost },
  receive: { sym: 'WBTC', amt: gets },
  pays: [leg(BigInt(cost))],
  mine,
});

const items = [offer('a', 3, 15), offer('b', 4, 18), offer('c', 5, 20)];
const balances = (weth: string) => ({ shielded: { [WETH]: weth }, unshielded: null });

describe('summarize totals', () => {
  test('all checked → the full pay/receive of the selection', () => {
    const s = summarize(items, ['a', 'b', 'c'], balances('100'), known);
    expect(s.count).toBe(3);
    expect(s.pay).toEqual({ sym: 'WETH', amt: 12 });
    expect(s.receive).toEqual({ sym: 'WBTC', amt: 53 });
    expect(s.blocked).toBeNull();
  });

  test('unchecking a row recomputes both totals', () => {
    const s = summarize(items, ['a', 'c'], balances('100'), known);
    expect(s.count).toBe(2);
    expect(s.pay.amt).toBe(8);
    expect(s.receive.amt).toBe(35);
  });

  test('the checked order is irrelevant — it is a fold, not a sequence', () => {
    expect(summarize(items, ['c', 'a'], balances('100')).pay.amt)
      .toBe(summarize(items, ['a', 'c'], balances('100')).pay.amt);
  });

  test('unknown ids are ignored', () => {
    expect(summarize(items, ['a', 'ghost'], balances('100')).count).toBe(1);
  });

  test('nothing checked → zero totals, the pair still named', () => {
    const s = summarize(items, [], balances('100'), known);
    expect(s.count).toBe(0);
    expect(s.pay).toEqual({ sym: 'WETH', amt: 0 });
    expect(s.receive).toEqual({ sym: 'WBTC', amt: 0 });
    // Not a shortfall: an empty selection costs nothing, it is simply not
    // confirmable (the dialog disables the CTA).
    expect(s.blocked).toBeNull();
  });

  test('an empty item list does not throw', () => {
    const s = summarize([], [], balances('100'));
    expect(s.count).toBe(0);
    expect(s.pay.sym).toBe('—');
  });
});

describe('summarize blocked message', () => {
  test('the checked subset is what gets balance-checked', () => {
    // 12 WETH for all three, but only 9 in the wallet.
    expect(summarize(items, ['a', 'b', 'c'], balances('9'), known).blocked)
      .toBe('Insufficient WETH: need 12, have 9');
    // Uncheck the 5 and it fits.
    expect(summarize(items, ['a', 'b'], balances('9'), known).blocked).toBeNull();
  });

  test('the cost is aggregated, not compared per offer', () => {
    // Each offer alone fits in 5; together they do not.
    expect(summarize(items, ['a', 'b'], balances('5'), known).blocked)
      .toBe('Insufficient WETH: need 7, have 5');
  });

  test('an undecodable blob contributes no cost', () => {
    const undecodable: SelectableOffer = { ...offer('x', 99, 1), pays: [] };
    expect(summarize([undecodable], ['x'], balances('0')).blocked).toBeNull();
  });
});

describe('summarize cta', () => {
  test('names the size of the commitment', () => {
    expect(summarize(items, ['a'], balances('100')).cta).toBe('Take offer');
    expect(summarize(items, ['a', 'b'], balances('100')).cta).toBe('Take 2 offers');
    expect(summarize(items, ['a', 'b', 'c'], balances('100')).cta).toBe('Take 3 offers');
  });

  test('empty selection says what is missing instead of "Take 0 offers"', () => {
    expect(summarize(items, [], balances('100')).cta).toBe('Select an offer');
  });
});

describe('affordableSelection', () => {
  test('everything, when the wallet covers the batch', () => {
    expect(affordableSelection(items, balances('100'))).toEqual(['a', 'b', 'c']);
  });

  test('the best-price-first prefix that still fits', () => {
    // 3 + 4 = 7 ≤ 8, adding 5 would not fit.
    expect(affordableSelection(items, balances('8'))).toEqual(['a', 'b']);
  });

  test('nothing, when even the first offer is out of reach', () => {
    expect(affordableSelection(items, balances('1'))).toEqual([]);
  });
});

describe('defaultSelection', () => {
  test('starts with the affordable rows checked', () => {
    expect(defaultSelection(items, balances('8'))).toEqual(['a', 'b']);
  });

  test('when nothing is affordable, everything starts checked so the dialog explains itself', () => {
    expect(defaultSelection(items, balances('1'))).toEqual(['a', 'b', 'c']);
    // …and the summary of that default carries the reason.
    expect(summarize(items, defaultSelection(items, balances('1')), balances('1'), known).blocked)
      .toBe('Insufficient WETH: need 12, have 1');
  });
});

describe('own offers stay identifiable in the list', () => {
  test('the `mine` flag rides along with the row', () => {
    const withMine = [offer('a', 3, 15, true), offer('b', 4, 18)];
    expect(withMine.filter((i) => i.mine).map((i) => i.id)).toEqual(['a']);
    // Including your own offer is a normal selection — it costs and pays like
    // any other row.
    expect(summarize(withMine, ['a', 'b'], balances('100')).pay.amt).toBe(7);
  });
});
