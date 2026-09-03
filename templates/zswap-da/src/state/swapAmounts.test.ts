// The Swap screen's coin ⇄ base-unit boundary (project 00024, spec User Story 2).
//
// This is the path an offer actually takes: what the user typed → what is sent
// to `/v1/quote` → what the wallet puts in the offer leg. Each case below is an
// acceptance scenario from the spec, pinned where it can be tested without a
// browser.
import { describe, expect, test } from 'bun:test';
import type { KnownToken } from '../types';
import { amountErrorText } from './amount';
import {
  displayRate,
  hasBalanceFor,
  legDecimals,
  parseLeg,
  suggestedFieldValue,
} from './swapAmounts';

const token = (name: string, decimals: number): KnownToken => ({
  token_color: name.toLowerCase().padEnd(64, '0'),
  name,
  kind: 'shielded',
  decimals,
});

const WBTC = token('WBTC', 6);
const WETH = token('WETH', 6);
/** A token that is deliberately NOT 6 — nothing may hard-code the default. */
const WSBTC = token('WSBTC', 8);

describe('legDecimals', () => {
  test("uses the token's own precision, and the default before one is picked", () => {
    expect(legDecimals(WBTC)).toBe(6);
    expect(legDecimals(WSBTC)).toBe(8);
    expect(legDecimals(null)).toBe(6);
  });
});

describe('parseLeg — what reaches /v1/quote and the offer', () => {
  test('typing 1.5 WBTC gives the give leg exactly 1500000n', () => {
    expect(parseLeg('1.5', WBTC).value).toBe(1_500_000n);
  });

  test('a pair of different precisions converts each leg with its own', () => {
    // "1.5 WBTC for 20 WSBTC" → 1_500_000 ↔ 2_000_000_000.
    expect(parseLeg('1.5', WBTC).value).toBe(1_500_000n);
    expect(parseLeg('20', WSBTC).value).toBe(2_000_000_000n);
  });

  test('1.0000005 of a 6-decimals token is refused, and the message says why', () => {
    const p = parseLeg('1.0000005', WBTC);
    expect(p.value).toBeNull();
    expect(p.error).toBe('precision');
    expect(amountErrorText(p.error!, WBTC.decimals, WBTC.name)).toBe(
      'Too many decimal places: WBTC supports 6 (e.g. 1.000001).',
    );
    // The very same digits ARE valid for the 8-decimals token.
    expect(parseLeg('1.0000005', WSBTC).value).toBe(100_000_050n);
  });

  test('an empty field is "empty", not a malformed number', () => {
    expect(parseLeg('', WBTC).error).toBe('empty');
  });
});

describe('suggestedFieldValue — the node auto-price lands in the field as coins', () => {
  test('suggested_to_amount 20000000 shows as 20', () => {
    expect(suggestedFieldValue('20000000', WETH)).toBe('20');
  });

  test('it round-trips: what the field shows re-parses to what the node sent', () => {
    for (const base of ['1', '1500000', '20000000', '999999999999']) {
      expect(parseLeg(suggestedFieldValue(base, WETH), WETH).value).toBe(BigInt(base));
    }
  });

  test('the TO leg uses the TO token precision, not the FROM one', () => {
    expect(suggestedFieldValue('2000000000', WSBTC)).toBe('20');
    expect(suggestedFieldValue('2000000000', WETH)).toBe('2000');
  });
});

describe('hasBalanceFor — the pre-submit affordability gate', () => {
  test('compares base units against the wallet string, with no scaling', () => {
    // 1.5 WBTC needed, 1.5 WBTC held.
    expect(hasBalanceFor(1_500_000n, '1500000')).toBe(true);
    expect(hasBalanceFor(1_500_001n, '1500000')).toBe(false);
  });

  test('a missing or unparseable balance is zero, never a pass', () => {
    expect(hasBalanceFor(1n, null)).toBe(false);
    expect(hasBalanceFor(1n, undefined)).toBe(false);
    expect(hasBalanceFor(1n, 'n/a')).toBe(false);
  });

  test('nothing typed yet is not a shortfall', () => {
    expect(hasBalanceFor(null, '0')).toBe(true);
    expect(hasBalanceFor(0n, '0')).toBe(true);
  });

  test('stays exact past 2^53, where a double comparison would tie', () => {
    const a = 9_007_199_254_740_993n; // 2^53 + 1
    expect(hasBalanceFor(a, '9007199254740992')).toBe(false);
    expect(Number(a)).toBe(9007199254740992); // …which is what a double would say
  });
});

describe('displayRate — "1 FROM = X TO"', () => {
  test('equal precisions print the node rate unchanged', () => {
    expect(displayRate(13.33, WBTC, WETH)).toBe(13.33);
  });

  test('mixed precisions scale by 10^(dFrom − dTo)', () => {
    expect(displayRate(1333, WBTC, WSBTC)).toBeCloseTo(13.33, 9);
    expect(displayRate(13.33, WSBTC, WBTC)).toBeCloseTo(1333, 9);
  });

  test('a missing rate prints 0 rather than NaN', () => {
    expect(displayRate(null, WBTC, WETH)).toBe(0);
    expect(displayRate(undefined, WBTC, WETH)).toBe(0);
  });
});
