// Display formatters, ported from the mock's data.jsx. Pure + reusable.
//
// TOKEN AMOUNTS DO NOT LIVE HERE. They are base-unit integers whose meaning
// depends on the token's `decimals`, so they are rendered by
// `state/amount.ts::formatAmount(baseUnits, decimals)`. The symbol-keyed `dp()`
// and the decimals-blind `fmtAmt`/`fmtBalance` that used to sit here were
// removed in project 00024: they keyed precision off a hard-coded list of mock
// symbols and printed raw base units as if they were coins.
//
// What remains is USD, rates and percentages — none of which is a token amount.

export function fmt(n: number | null | undefined, d?: number): string {
  if (n == null || isNaN(n)) return '0';
  if (d == null) d = n >= 1000 ? 2 : 4;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtUsd(n: number): string {
  return '$' + fmt(n, 2);
}

// Rate display: prefer plain decimals; use scientific (3 × 10⁻⁵) only when it's
// shorter than the plain form. Ported from the mock's data.jsx.
export type RateDisplay = { kind: 'plain'; text: string } | { kind: 'sci'; mant: string; exp: number };
export function rateDisplay(v: number): RateDisplay {
  if (!v || isNaN(v)) return { kind: 'plain', text: '0' };
  let plain: string;
  if (v >= 1) plain = v.toLocaleString('en-US', { maximumFractionDigits: v > 100 ? 2 : 4 });
  else plain = parseFloat(v.toPrecision(3)).toString();
  const exp = Math.floor(Math.log10(v));
  const mant = +(v / Math.pow(10, exp)).toPrecision(3);
  const mantStr = String(mant);
  const sciLen = mantStr.length + 4 + String(Math.abs(exp)).length;
  if (plain.length <= sciLen) return { kind: 'plain', text: plain };
  return { kind: 'sci', mant: mantStr, exp };
}

// ── Reference-price helpers (00005) ───────────────────────────────────────────
// The node publishes a reference (market) rate, the source it came from and how
// old it is; the UI has to say all three without ever inventing a number. These
// stay pure so they can be unit-tested without React.

/** Price sources the node reports for a token, in `/v1/quote` and `/v1/prices`.
 *  `fallback`/`demo-fallback` are the deterministic demo price — not a market. */
export type PriceSource = 'feed' | 'seed' | 'fixed' | 'manual' | 'fallback' | 'demo-fallback';

/** True when a source is backed by a real reference price rather than the demo
 *  hash price. `fixed` (a $1 peg) and `manual` (an operator override) count. */
export function isMarketSource(s: string | null | undefined): boolean {
  return s === 'feed' || s === 'seed' || s === 'fixed' || s === 'manual';
}

/** A percentage with one decimal, e.g. 0.025 → "2.5". Fractions in, percent out. */
export function pct1(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

/**
 * Signed offset of a price from the reference, `implied / market − 1`, as a
 * display string: "−2.5%" (below reference — the good side for a taker) or
 * "+1.2%". Uses U+2212 MINUS, matching the rest of the UI.
 *
 * Returns null when either side is missing or the reference is zero — the
 * caller must then render nothing rather than a fabricated 0%.
 */
export function fmtOffsetPct(
  implied: number | null | undefined,
  market: number | null | undefined,
): string | null {
  if (implied == null || market == null) return null;
  if (!isFinite(implied) || !isFinite(market) || market === 0) return null;
  const pct = (implied / market - 1) * 100;
  if (!isFinite(pct)) return null;
  const rounded = Number(pct.toFixed(1));
  if (rounded === 0) return '0.0%';
  return (rounded < 0 ? '−' : '+') + Math.abs(rounded).toFixed(1) + '%';
}

/**
 * How old a timestamp is, in the coarse buckets a price age needs:
 * "just now" < 1 min, "12 min ago", "3 h ago" (< 48 h), then "5 d ago".
 * Future timestamps (clock skew between node and browser) read "just now".
 * Returns null for a missing or unparseable timestamp.
 */
export function fmtAge(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  const ms = now - t;
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(ms / 86_400_000)} d ago`;
}
