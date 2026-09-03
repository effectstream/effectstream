import { describe, expect, test } from 'bun:test';
import type { ParsedLeg } from './offerParse';
import type { KnownToken } from '../types';
import { shortfallsFromLegs, shortfallMessage, takerShortfalls, batchTakerShortfalls, affordableIndices } from './takerBalance';

const A = 'aa'.repeat(32); // shielded token color
const B = 'bb'.repeat(32); // unshielded token color
const leg = (color: string, kind: ParsedLeg['kind'], amount: bigint): ParsedLeg => ({ color, kind, amount });
const known: KnownToken[] = [{ token_color: A, name: 'TESTTOKENA', kind: 'shielded', decimals: 6 } as KnownToken];
/** One whole TESTTOKENA coin in base units. */
const COIN = 1_000_000n;

describe('shortfallsFromLegs', () => {
  test('sufficient balance → no shortfall', () => {
    const sf = shortfallsFromLegs([leg(A, 'shielded', 51n)], { [A]: '1000' }, null, known);
    expect(sf).toEqual([]);
  });

  test('exact balance → no shortfall (>= boundary)', () => {
    expect(shortfallsFromLegs([leg(A, 'shielded', 51n)], { [A]: '51' }, null)).toEqual([]);
  });

  test('insufficient shielded → one shortfall, named + amounts', () => {
    const sf = shortfallsFromLegs([leg(A, 'shielded', 51n)], { [A]: '10' }, null, known);
    expect(sf.length).toBe(1);
    expect(sf[0]).toMatchObject({ color: A, kind: 'shielded', need: 51n, have: 10n, sym: 'TESTTOKENA' });
  });

  test('missing token entirely → have 0', () => {
    const sf = shortfallsFromLegs([leg(A, 'shielded', 5n)], {}, null);
    expect(sf[0]).toMatchObject({ need: 5n, have: 0n });
  });

  test('insufficient unshielded uses the unshielded map, not shielded', () => {
    // Plenty in the shielded map, but the leg is unshielded and its map is empty.
    const sf = shortfallsFromLegs([leg(B, 'unshielded', 100n)], { [B]: '9999' }, {});
    expect(sf.length).toBe(1);
    expect(sf[0]).toMatchObject({ kind: 'unshielded', have: 0n });
  });

  test('multi-want partial → only the uncovered leg', () => {
    const sf = shortfallsFromLegs(
      [leg(A, 'shielded', 51n), leg(B, 'unshielded', 100n)],
      { [A]: '1000' },
      { [B]: '40' },
    );
    expect(sf.length).toBe(1);
    expect(sf[0]).toMatchObject({ color: B, need: 100n, have: 40n });
  });

  test('comma-grouped balance string parses', () => {
    expect(shortfallsFromLegs([leg(A, 'shielded', 1500n)], { [A]: '1,000' }, null)[0]).toMatchObject({ have: 1000n });
  });

  test('balances are BASE-UNIT strings — a whole-coin string is truncated', () => {
    // Pin, not a feature: `toBig` cuts at the '.', so handing this comparison a
    // whole-coin string ("1.5") would silently read 1 base unit and block every
    // take. Wallet balances and ParsedLeg.amount are both base units, and this
    // test exists so a future refactor that "helpfully" formats a balance into
    // coins on the way in fails here instead of in a user's wallet.
    expect(shortfallsFromLegs([leg(A, 'shielded', 2n)], { [A]: '1.5' }, null)[0]).toMatchObject({ have: 1n });
    expect(shortfallsFromLegs([leg(A, 'shielded', 1_500_000n)], { [A]: '1500000' }, null)).toEqual([]);
  });

  test('the shortfall carries the token precision it will be rendered with', () => {
    const sf = shortfallsFromLegs([leg(A, 'shielded', 51n)], { [A]: '10' }, null, known);
    expect(sf[0].decimals).toBe(6);
    // Unregistered colour: nothing says otherwise, so the default applies.
    expect(shortfallsFromLegs([leg(B, 'unshielded', 5n)], null, {})[0].decimals).toBe(6);
  });

  test('no pays legs → nothing to block', () => {
    expect(shortfallsFromLegs([], null, null)).toEqual([]);
  });
});

describe('shortfallMessage', () => {
  test('null when fundable', () => {
    expect(shortfallMessage([])).toBeNull();
  });
  test('names the first token + need/have IN WHOLE COINS', () => {
    // The comparison is in base units; the sentence sits beside the confirm
    // dialog's coin totals, so it has to speak the same unit the user does.
    const msg = shortfallMessage(
      shortfallsFromLegs([leg(A, 'shielded', 51n * COIN)], { [A]: '10000000' }, null, known),
    );
    expect(msg).toBe('Insufficient TESTTOKENA: need 51, have 10');
  });
  test('a sub-coin shortfall keeps its precision rather than reading as 0', () => {
    const msg = shortfallMessage(
      shortfallsFromLegs([leg(A, 'shielded', 1_500_000n)], { [A]: '1' }, null, known),
    );
    expect(msg).toBe('Insufficient TESTTOKENA: need 1.5, have 0.000001');
  });
  test('summarizes extra shortfalls', () => {
    const msg = shortfallMessage([
      { color: A, kind: 'shielded', need: 5n * COIN, have: 0n, sym: 'TESTTOKENA', decimals: 6 },
      { color: B, kind: 'unshielded', need: 2n * COIN, have: 0n, sym: 'USDC', decimals: 6 },
    ]);
    expect(msg).toBe('Insufficient TESTTOKENA: need 5, have 0 (+1 more)');
  });
});

describe('takerShortfalls (blob path)', () => {
  test('undecodable blob → not blocked (returns [])', () => {
    expect(takerShortfalls('not-a-real-offer-blob', { [A]: '0' }, null, 'undeployed' as any, known)).toEqual([]);
  });
});

describe('batchTakerShortfalls (blob path)', () => {
  test('undecodable blobs → not blocked (returns [])', () => {
    expect(batchTakerShortfalls(['nope', 'also-nope'], { [A]: '0' }, null, 'undeployed' as any)).toEqual([]);
  });
});

describe('affordableIndices', () => {
  test('all fit → every index', () => {
    const legs = [[leg(A, 'shielded', 30n)], [leg(A, 'shielded', 30n)]];
    expect(affordableIndices(legs, { [A]: '100' }, null)).toEqual([0, 1]);
  });

  test('accumulates across offers of the same color', () => {
    // 40 + 40 = 80 (ok), + 40 = 120 (over 100) → drop the third.
    const legs = [[leg(A, 'shielded', 40n)], [leg(A, 'shielded', 40n)], [leg(A, 'shielded', 40n)]];
    expect(affordableIndices(legs, { [A]: '100' }, null)).toEqual([0, 1]);
  });

  test('individually-fine batch that overspends in aggregate → prefix only', () => {
    // Each 60 fits 100 alone (the old per-offer bug), but together they cannot.
    const legs = [[leg(A, 'shielded', 60n)], [leg(A, 'shielded', 60n)]];
    expect(affordableIndices(legs, { [A]: '100' }, null)).toEqual([0]);
  });

  test('keeps scanning past an unaffordable offer', () => {
    // 40 ok; +80 → 120 over, skip; +30 → 70 still ok, include.
    const legs = [[leg(A, 'shielded', 40n)], [leg(A, 'shielded', 80n)], [leg(A, 'shielded', 30n)]];
    expect(affordableIndices(legs, { [A]: '100' }, null)).toEqual([0, 2]);
  });

  test('tracks each (kind,color) budget independently', () => {
    // A budget 50, B budget 50. A40 ok, B40 ok, A40 → 80>50 drop.
    const legs = [[leg(A, 'shielded', 40n)], [leg(B, 'unshielded', 40n)], [leg(A, 'shielded', 40n)]];
    expect(affordableIndices(legs, { [A]: '50' }, { [B]: '50' })).toEqual([0, 1]);
  });

  test('none affordable → empty', () => {
    expect(affordableIndices([[leg(A, 'shielded', 200n)]], { [A]: '100' }, null)).toEqual([]);
  });
});
