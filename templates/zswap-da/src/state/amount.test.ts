// Whole coins ⇄ base units (project 00024).
//
// These cases exist because the amount is what settles on chain: a rounding bug
// here posts an offer the user never agreed to. So the round trip is pinned
// exactly, over-precision is pinned as a REFUSAL rather than a rounding, and
// values past 2^53 are pinned to prove the maths never goes through a double.
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_DECIMALS,
  MAX_BASE_UNITS,
  amountErrorText,
  formatAmount,
  formatBaseUnits,
  parseAmount,
  parseWholeCoins,
  sanitizeAmountInput,
  scaleRate,
  toWholeCoinsNumber,
} from './amount';

describe('DEFAULT_DECIMALS', () => {
  test('is 6 — every token this stack mints has 6', () => {
    expect(DEFAULT_DECIMALS).toBe(6);
  });
});

describe('parseWholeCoins', () => {
  test('the headline case: 1.5 of a 6-decimals token is 1_500_000 base units', () => {
    expect(parseWholeCoins('1.5', 6)).toBe(1_500_000n);
  });

  test('whole numbers scale by 10^decimals', () => {
    expect(parseWholeCoins('1000', 6)).toBe(1_000_000_000n);
    expect(parseWholeCoins('1', 6)).toBe(1_000_000n);
    expect(parseWholeCoins('0', 6)).toBe(0n);
  });

  test('the smallest expressible amount is one base unit', () => {
    expect(parseWholeCoins('0.000001', 6)).toBe(1n);
  });

  test('a partial fraction is right-padded, not left-padded', () => {
    expect(parseWholeCoins('0.1', 6)).toBe(100_000n);
    expect(parseWholeCoins('0.01', 6)).toBe(10_000n);
    expect(parseWholeCoins('.5', 6)).toBe(500_000n);
    expect(parseWholeCoins('2.', 6)).toBe(2_000_000n);
  });

  test('grouping separators are accepted', () => {
    expect(parseWholeCoins('1,000.5', 6)).toBe(1_000_500_000n);
    expect(parseWholeCoins('1 000', 6)).toBe(1_000_000_000n);
  });

  test('other decimals are honoured — nothing hard-codes 6', () => {
    expect(parseWholeCoins('1.5', 8)).toBe(150_000_000n);
    expect(parseWholeCoins('1.5', 2)).toBe(150n);
    expect(parseWholeCoins('7', 0)).toBe(7n);
  });

  test('a float would have lost this — string maths does not', () => {
    // 0.07 * 1e6 === 70000.00000000001 in IEEE-754.
    expect(parseWholeCoins('0.07', 6)).toBe(70_000n);
    // 4.35 * 100 === 434.99999999999994.
    expect(parseWholeCoins('4.35', 2)).toBe(435n);
  });

  test('past 2^53 the value is still exact', () => {
    // 2^53 = 9_007_199_254_740_992; this is a coin amount well beyond it.
    expect(parseWholeCoins('12345678901.234567', 6)).toBe(12_345_678_901_234_567n);
    // What the banned `Number(x) * 1e6` would have produced instead: off by one
    // base unit, and BigInt() would have preserved the corruption faithfully.
    expect(BigInt(12345678901.234567 * 1e6)).toBe(12_345_678_901_234_568n);
  });

  test('over-precision is REFUSED, not rounded (spec Q9)', () => {
    expect(parseWholeCoins('1.0000005', 6)).toBeNull();
    expect(parseAmount('1.0000005', 6).error).toBe('precision');
    expect(parseAmount('1.0000005', 6).fractionDigits).toBe(7);
    expect(parseWholeCoins('0.5', 0)).toBeNull();
  });

  test('trailing zeros past the precision are not over-precision', () => {
    // "1.5000000" is exactly 1.5 — nothing is lost, so nothing is refused.
    expect(parseWholeCoins('1.5000000', 6)).toBe(1_500_000n);
    expect(parseWholeCoins('1.000000000', 6)).toBe(1_000_000n);
  });

  test('negatives, exponents and junk are refused with distinct reasons', () => {
    expect(parseAmount('-1', 6).error).toBe('negative');
    expect(parseAmount('1e6', 6).error).toBe('malformed');
    expect(parseAmount('1.2.3', 6).error).toBe('malformed');
    expect(parseAmount('abc', 6).error).toBe('malformed');
    expect(parseAmount('', 6).error).toBe('empty');
    expect(parseAmount('.', 6).error).toBe('empty');
  });

  test('anything past the ledger ceiling (2^64 − 1) is refused', () => {
    expect(formatBaseUnits(MAX_BASE_UNITS, 0)).toBe('18446744073709551615');
    expect(parseWholeCoins('18446744073709.551615', 6)).toBe(MAX_BASE_UNITS);
    expect(parseAmount('18446744073709.551616', 6).error).toBe('overflow');
    expect(parseWholeCoins('99999999999999999999', 6)).toBeNull();
  });
});

describe('formatBaseUnits', () => {
  test('exact inverse of parseWholeCoins, without trailing zeros', () => {
    expect(formatBaseUnits(1_500_000n, 6)).toBe('1.5');
    expect(formatBaseUnits(1n, 6)).toBe('0.000001');
    expect(formatBaseUnits(1_000_000_000n, 6)).toBe('1000');
    expect(formatBaseUnits(0n, 6)).toBe('0');
    expect(formatBaseUnits(100_000n, 6)).toBe('0.1');
  });

  test('round-trips every sample through parseWholeCoins', () => {
    for (const raw of ['0', '1', '1.5', '0.000001', '1000', '1234.5678', '0.999999']) {
      const base = parseWholeCoins(raw, 6)!;
      expect(formatBaseUnits(base, 6)).toBe(String(Number(raw)));
    }
  });

  test('decimals 0 has no fractional part at all', () => {
    expect(formatBaseUnits(1234n, 0)).toBe('1234');
  });

  test('accepts the string balances the wallet actually returns', () => {
    expect(formatBaseUnits('1000000000', 6)).toBe('1000');
    expect(formatBaseUnits('1,000,000', 6)).toBe('1');
    expect(formatBaseUnits('not-a-number', 6)).toBe('0');
  });
});

describe('formatAmount', () => {
  test('groups the integer part and drops trailing zeros', () => {
    expect(formatAmount(1_234_500_000n, 6)).toBe('1,234.5');
    expect(formatAmount(1_000_000_000n, 6)).toBe('1,000');
    expect(formatAmount(1_500_000n, 6)).toBe('1.5');
  });

  test('maxFrac rounds half-up for display only', () => {
    expect(formatAmount(1_234_567n, 6, 2)).toBe('1.23');
    expect(formatAmount(1_235_000n, 6, 2)).toBe('1.24');
    expect(formatAmount(1_999_999n, 6, 0)).toBe('2');
  });

  test('a sub-unit amount still reads as a number, not as 0', () => {
    expect(formatAmount(1n, 6)).toBe('0.000001');
  });
});

describe('sanitizeAmountInput', () => {
  test('keeps digits and one decimal point', () => {
    expect(sanitizeAmountInput('1.5', 6)).toBe('1.5');
    expect(sanitizeAmountInput('1a.5b', 6)).toBe('1.5');
    expect(sanitizeAmountInput('1.2.3', 6)).toBe('1.23');
    expect(sanitizeAmountInput('-5', 6)).toBe('5');
  });

  test('a typed comma becomes the decimal point (nobody groups by hand here)', () => {
    expect(sanitizeAmountInput('1,5', 6)).toBe('1.5');
  });

  test('one digit past the precision SURVIVES so the refusal can be seen', () => {
    // Truncating at exactly 6 would silently swallow the 7th digit — the very
    // thing Q9 forbids. The parser refuses it and the screen says why.
    expect(sanitizeAmountInput('1.0000005', 6)).toBe('1.0000005');
    expect(parseWholeCoins(sanitizeAmountInput('1.0000005', 6), 6)).toBeNull();
  });

  test('a pasted essay is still bounded', () => {
    expect(sanitizeAmountInput('1.123456789012345', 6)).toBe('1.1234567');
    expect(sanitizeAmountInput('1.5', 0)).toBe('1.5');
  });
});

describe('toWholeCoinsNumber', () => {
  test('base units read as coins', () => {
    expect(toWholeCoinsNumber(1_500_000n, 6)).toBe(1.5);
    expect(toWholeCoinsNumber('1000000000', 6)).toBe(1000);
    expect(toWholeCoinsNumber(0n, 6)).toBe(0);
  });
});

describe('scaleRate', () => {
  test('equal decimals leave the rate untouched', () => {
    expect(scaleRate(13.33, 6, 6)).toBe(13.33);
  });

  test('a 6-decimals base against an 8-decimals quote scales by 10^-2', () => {
    // 1 base coin = 10^6 base units; 1 quote coin = 10^8. A base-unit rate of
    // 1333 means 1 base coin buys 1333 × 10^6 / 10^8 = 13.33 quote coins.
    expect(scaleRate(1333, 6, 8)).toBeCloseTo(13.33, 9);
    expect(scaleRate(13.33, 8, 6)).toBeCloseTo(1333, 9);
  });

  test('non-finite input never leaks NaN into the UI', () => {
    expect(scaleRate(NaN, 6, 6)).toBe(0);
    expect(scaleRate(Infinity, 6, 8)).toBe(0);
  });
});

describe('amountErrorText', () => {
  test('the precision message names the token and its precision', () => {
    expect(amountErrorText('precision', 6, 'WBTC')).toBe(
      'Too many decimal places: WBTC supports 6 (e.g. 1.000001).',
    );
  });

  test('a 0-decimals token is told to use whole numbers', () => {
    expect(amountErrorText('precision', 0, 'NIGHT')).toBe(
      'NIGHT has no fractional units — enter a whole number.',
    );
  });

  test('every other reason has its own sentence', () => {
    expect(amountErrorText('negative', 6)).toBe('Amounts must be positive.');
    expect(amountErrorText('overflow', 6)).toBe('That amount is larger than the ledger can hold.');
    expect(amountErrorText('malformed', 6)).toContain('digits and one decimal point');
  });
});
