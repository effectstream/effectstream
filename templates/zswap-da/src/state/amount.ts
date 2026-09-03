// Whole coins ⇄ base units. The single place this app converts between what a
// user types/reads and what the chain and the node API carry.
//
// THE INVARIANT: every amount on the wire (`/v1/quote`, `/v1/offers`,
// `/v1/chart/*`, wallet balances) and every amount on chain is an INTEGER of
// base units. A token's `decimals` (from `GET /v1/known-tokens`) says how many
// base units make one whole coin: 1 coin = 10^decimals base units. Nothing in
// this module ever changes what is submitted — it only changes how the number
// is spelled at the edges.
//
// Everything here is string/bigint maths. `Number(x) * 1e6` is not used and
// must not be introduced: 1e6 is exactly representable but the product is not
// for most inputs (`0.07 * 1e6 === 70000.00000000001`), and above 2^53 a double
// silently rounds — which would post an offer for an amount the user never
// typed. Doubles appear only in `toWholeCoinsNumber` / `scaleRate`, which exist
// for display ratios and are documented as such.

/**
 * Decimals assumed when a token does not say.
 *
 * Two cases: a node older than kernel 00024 serves `known_tokens` rows without
 * the field, and a colour the wallet holds that is in no registry at all
 * (TokenPicker synthesises those). Every token this stack mints has 6, so 6 is
 * the honest assumption rather than 0 (project 00024 / spec Q8).
 */
export const DEFAULT_DECIMALS = 6;

/** The ledger mints `Uint<64>`, so no base-unit amount may exceed 2^64 − 1. */
export const MAX_BASE_UNITS = (1n << 64n) - 1n;

/** Why a typed amount was refused. `null` value + this code drives the copy. */
export type AmountError =
  /** No digits at all (empty, or just a dot). */
  | 'empty'
  /** Characters outside `[0-9.]`, more than one dot, or an exponent. */
  | 'malformed'
  /** A leading `-`: offers are never negative. */
  | 'negative'
  /** More fraction digits than the token can express — refused, NEVER rounded. */
  | 'precision'
  /** Past the ledger's `Uint<64>` ceiling. */
  | 'overflow';

export interface ParsedAmount {
  /** Exact base units, or null when `error` is set. */
  value: bigint | null;
  error: AmountError | null;
  /** Fraction digits actually typed — for the 'precision' message. */
  fractionDigits: number;
}

const GROUPING = /[,_\s]/g;

/**
 * Parse a typed whole-coin amount into exact base units, reporting WHY it was
 * refused. `parseWholeCoins` is the value-only form used by callers that just
 * need the number.
 */
export function parseAmount(raw: string, decimals: number): ParsedAmount {
  const s = String(raw ?? '').replace(GROUPING, '');
  if (s === '') return { value: null, error: 'empty', fractionDigits: 0 };
  if (s.startsWith('-')) return { value: null, error: 'negative', fractionDigits: 0 };
  if (!/^\d*\.?\d*$/.test(s)) return { value: null, error: 'malformed', fractionDigits: 0 };
  const [intPart = '', fracPart = ''] = s.split('.');
  if (intPart === '' && fracPart === '') return { value: null, error: 'empty', fractionDigits: 0 };
  const d = safeDecimals(decimals);
  // Trailing zeros past the token's precision are not a loss of information —
  // "1.5000000" at 6 decimals is exactly 1.5 — so only SIGNIFICANT excess
  // digits are refused.
  const significantFrac = fracPart.replace(/0+$/, '');
  if (significantFrac.length > d) {
    return { value: null, error: 'precision', fractionDigits: significantFrac.length };
  }
  const padded = (fracPart + '0'.repeat(d)).slice(0, d);
  let value: bigint;
  try {
    value = BigInt((intPart || '0') + padded);
  } catch {
    return { value: null, error: 'malformed', fractionDigits: fracPart.length };
  }
  if (value > MAX_BASE_UNITS) {
    return { value: null, error: 'overflow', fractionDigits: fracPart.length };
  }
  return { value, error: null, fractionDigits: fracPart.length };
}

/**
 * Whole coins → base units, exactly. `parseWholeCoins('1.5', 6) === 1500000n`.
 *
 * Returns null for anything refused (see {@link AmountError}); over-precise
 * input is REFUSED, never rounded — the amount is what settles on chain, and
 * quietly posting a different one than the user typed is not an option
 * (spec 00024 Q9).
 */
export function parseWholeCoins(raw: string, decimals: number): bigint | null {
  return parseAmount(raw, decimals).value;
}

/** Human sentence for a refusal, naming the token and its precision. */
export function amountErrorText(
  error: AmountError,
  decimals: number,
  symbol?: string | null,
): string {
  const d = safeDecimals(decimals);
  const tok = symbol ? ` ${symbol}` : '';
  switch (error) {
    case 'empty':
      return 'Enter an amount.';
    case 'negative':
      return 'Amounts must be positive.';
    case 'precision':
      return d === 0
        ? `${symbol ?? 'This token'} has no fractional units — enter a whole number.`
        : `Too many decimal places:${tok} supports ${d} (e.g. ${exampleFor(d)}).`;
    case 'overflow':
      return 'That amount is larger than the ledger can hold.';
    case 'malformed':
    default:
      return 'Enter a number, e.g. 1.5 — digits and one decimal point only.';
  }
}

function exampleFor(decimals: number): string {
  return decimals <= 0 ? '1' : '1.' + '0'.repeat(decimals - 1) + '1';
}

/**
 * Base units → the exact whole-coin string, with no trailing zeros.
 * `formatBaseUnits(1n, 6) === '0.000001'`, `formatBaseUnits(1500000n, 6) === '1.5'`.
 *
 * Exact inverse of {@link parseWholeCoins}; ungrouped, so it round-trips.
 */
export function formatBaseUnits(v: bigint | string | number, decimals: number): string {
  const d = safeDecimals(decimals);
  const n = toBigIntLoose(v);
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(d + 1, '0');
  const intPart = digits.slice(0, digits.length - d) || '0';
  const fracPart = d === 0 ? '' : digits.slice(digits.length - d).replace(/0+$/, '');
  return (neg ? '-' : '') + intPart + (fracPart ? '.' + fracPart : '');
}

/**
 * Base units → a grouped whole-coin string for display: `1234500000n` at 6
 * decimals reads `1,234.5`. Rounds (half-up) to `maxFrac` fraction digits —
 * DISPLAY ONLY; never feed the result back into a submit path.
 */
export function formatAmount(
  v: bigint | string | number,
  decimals: number,
  maxFrac?: number,
): string {
  const d = safeDecimals(decimals);
  const cap = maxFrac == null ? d : Math.max(0, Math.min(Math.trunc(maxFrac), d));
  let n = toBigIntLoose(v);
  const neg = n < 0n;
  if (neg) n = -n;
  let scale = d;
  const drop = d - cap;
  if (drop > 0) {
    const p = 10n ** BigInt(drop);
    n = (n + p / 2n) / p; // half-up
    scale = cap;
  }
  const exact = formatBaseUnits(n, scale);
  const [intPart, fracPart] = exact.split('.');
  const grouped = BigInt(intPart).toLocaleString('en-US');
  return (neg ? '−' : '') + grouped + (fracPart ? '.' + fracPart : '');
}

/**
 * Keystroke filter for an amount field: digits and at most one decimal point,
 * everything else dropped.
 *
 * The fraction is bounded at `decimals + 1` digits rather than `decimals`: it
 * has to be possible to SEE that you typed one digit too many, because
 * over-precision is refused with a message and not silently truncated (Q9).
 * Truncating at exactly `decimals` would swallow the seventh digit of
 * `1.0000005` and the user would never learn why their amount changed; the
 * bound only stops a pasted essay from living in the field.
 */
export function sanitizeAmountInput(raw: string, decimals: number): string {
  const d = safeDecimals(decimals);
  let out = '';
  let seenDot = false;
  for (const ch of String(raw ?? '')) {
    if (ch >= '0' && ch <= '9') { out += ch; continue; }
    if ((ch === '.' || ch === ',') && !seenDot) { out += '.'; seenDot = true; }
  }
  const dot = out.indexOf('.');
  if (dot >= 0) out = out.slice(0, dot + 1) + out.slice(dot + 1, dot + 1 + d + 1);
  return out;
}

/**
 * Base units → whole coins as a double.
 *
 * For RATIOS and chart maths only (a book price, a percentage, a bar width) —
 * never for an amount that is submitted. Above 2^53 base units the result is
 * approximate, which is fine for a price ladder and fatal for a settlement.
 */
export function toWholeCoinsNumber(v: bigint | string | number, decimals: number): number {
  const n = Number(formatBaseUnits(v, decimals));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A base-unit rate → the same rate between whole coins.
 *
 * The node's `implied_rate`, `market_rate`, `/v1/chart` prices and
 * `price(base)/price(quote)` are all "base units of TO per base unit of FROM".
 * One whole FROM coin is 10^dFrom base units and one whole TO coin is 10^dTo,
 * so the whole-coin rate is `rate × 10^(dFrom − dTo)` — the identity while
 * every token is 6, and the reason a future 8-decimals token still reads right.
 */
export function scaleRate(rate: number, fromDecimals: number, toDecimals: number): number {
  if (!Number.isFinite(rate)) return 0;
  const e = safeDecimals(fromDecimals) - safeDecimals(toDecimals);
  return e === 0 ? rate : rate * Math.pow(10, e);
}

/**
 * A RAW BASE-UNIT value (a wallet balance string, a leg amount) → bigint.
 *
 * No scaling: this is for numbers that are already base units and only need to
 * stop being a string. Never throws — an unparseable balance counts as zero,
 * which can only ever over-block, never over-spend.
 */
export function parseBaseUnits(v: bigint | string | number | null | undefined): bigint {
  return v == null ? 0n : toBigIntLoose(v);
}

/** Registry values are `[0, 38]`; anything else is a broken row, not a token. */
function safeDecimals(d: number | null | undefined): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return DEFAULT_DECIMALS;
  return Math.min(38, Math.max(0, Math.trunc(n)));
}

/** Tolerant bigint coercion: balances arrive as strings, sums as numbers. */
function toBigIntLoose(v: bigint | string | number): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? BigInt(Math.round(v)) : 0n;
  const s = String(v ?? '').replace(GROUPING, '').split('.')[0];
  if (s === '' || s === '-') return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
}
