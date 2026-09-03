// Reference-price formatters (project 00005). Pure string maths — the point of
// these tests is that the UI never prints a number it does not have, and that
// the sign convention ("−" = below reference = the good side for a taker) is
// the same one the rest of the Swap screen already uses.
import { describe, expect, test } from 'bun:test';
import { fmtAge, fmtOffsetPct, isMarketSource, pct1 } from './format';

const MINUS = '−'; // U+2212, not an ASCII hyphen

describe('fmtOffsetPct', () => {
  test('below the reference reads as a negative percent', () => {
    expect(fmtOffsetPct(0.975, 1)).toBe(`${MINUS}2.5%`);
    expect(fmtOffsetPct(31.5, 32)).toBe(`${MINUS}1.6%`);
  });

  test('above the reference reads as a positive percent', () => {
    expect(fmtOffsetPct(1.012, 1)).toBe('+1.2%');
  });

  test('exactly at the reference has no sign', () => {
    expect(fmtOffsetPct(32, 32)).toBe('0.0%');
    // −0 must not surface as "−0.0%"
    expect(fmtOffsetPct(0.999999, 1)).toBe('0.0%');
  });

  test('rounds to one decimal', () => {
    expect(fmtOffsetPct(0.98999, 1)).toBe(`${MINUS}1.0%`);
    expect(fmtOffsetPct(1.0449, 1)).toBe('+4.5%');
  });

  test('returns null rather than inventing an offset', () => {
    expect(fmtOffsetPct(null, 1)).toBeNull();
    expect(fmtOffsetPct(1, null)).toBeNull();
    expect(fmtOffsetPct(undefined, undefined)).toBeNull();
    expect(fmtOffsetPct(1, 0)).toBeNull();
    expect(fmtOffsetPct(NaN, 1)).toBeNull();
    expect(fmtOffsetPct(1, Infinity)).toBeNull();
  });
});

describe('fmtAge', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  test('buckets', () => {
    expect(fmtAge(ago(5_000), now)).toBe('just now');
    expect(fmtAge(ago(59_000), now)).toBe('just now');
    expect(fmtAge(ago(60_000), now)).toBe('1 min ago');
    expect(fmtAge(ago(45 * 60_000), now)).toBe('45 min ago');
    expect(fmtAge(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(fmtAge(ago(47 * 3_600_000), now)).toBe('47 h ago');
    expect(fmtAge(ago(48 * 3_600_000), now)).toBe('2 d ago');
    expect(fmtAge(ago(9 * 86_400_000), now)).toBe('9 d ago');
  });

  test('a future timestamp (clock skew) is not negative', () => {
    expect(fmtAge(new Date(now + 60_000).toISOString(), now)).toBe('just now');
  });

  test('null for missing or unparseable input', () => {
    expect(fmtAge(null, now)).toBeNull();
    expect(fmtAge(undefined, now)).toBeNull();
    expect(fmtAge('', now)).toBeNull();
    expect(fmtAge('not a date', now)).toBeNull();
  });
});

describe('isMarketSource', () => {
  test('real reference prices', () => {
    for (const s of ['feed', 'seed', 'fixed', 'manual']) expect(isMarketSource(s)).toBe(true);
  });
  test('the demo price is not a market', () => {
    for (const s of ['fallback', 'demo-fallback', '', 'nonsense']) expect(isMarketSource(s)).toBe(false);
    expect(isMarketSource(null)).toBe(false);
    expect(isMarketSource(undefined)).toBe(false);
  });
});

describe('pct1', () => {
  test('fraction in, percent out', () => {
    expect(pct1(0.025)).toBe('2.5');
    expect(pct1(0.01)).toBe('1.0');
    expect(pct1(0)).toBe('0.0');
  });
});
