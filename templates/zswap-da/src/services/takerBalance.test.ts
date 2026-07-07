import { describe, expect, test } from 'bun:test';
import type { ParsedLeg } from './offerParse';
import type { KnownToken } from '../types';
import { shortfallsFromLegs, shortfallMessage, takerShortfalls } from './takerBalance';

const A = 'aa'.repeat(32); // shielded token color
const B = 'bb'.repeat(32); // unshielded token color
const leg = (color: string, kind: ParsedLeg['kind'], amount: bigint): ParsedLeg => ({ color, kind, amount });
const known: KnownToken[] = [{ token_color: A, name: 'TESTTOKENA', kind: 'shielded' } as KnownToken];

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

  test('no pays legs → nothing to block', () => {
    expect(shortfallsFromLegs([], null, null)).toEqual([]);
  });
});

describe('shortfallMessage', () => {
  test('null when fundable', () => {
    expect(shortfallMessage([])).toBeNull();
  });
  test('names the first token + need/have', () => {
    const msg = shortfallMessage(shortfallsFromLegs([leg(A, 'shielded', 51n)], { [A]: '10' }, null, known));
    expect(msg).toBe('Insufficient TESTTOKENA: need 51, have 10');
  });
  test('summarizes extra shortfalls', () => {
    const msg = shortfallMessage([
      { color: A, kind: 'shielded', need: 5n, have: 0n, sym: 'TESTTOKENA' },
      { color: B, kind: 'unshielded', need: 2n, have: 0n, sym: 'USDC' },
    ]);
    expect(msg).toBe('Insufficient TESTTOKENA: need 5, have 0 (+1 more)');
  });
});

describe('takerShortfalls (blob path)', () => {
  test('undecodable blob → not blocked (returns [])', () => {
    expect(takerShortfalls('not-a-real-offer-blob', { [A]: '0' }, null, 'undeployed' as any, known)).toEqual([]);
  });
});
