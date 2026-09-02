// Reference-rate derivation for the Swap and Market screens (project 00005).
//
// The node publishes a reference (market) price per known token and says where
// each one came from. Everything a screen needs to say about that — the rate,
// the offset from it, the sponsorship threshold, the provider and the age — is
// derived here, as pure functions over the API payloads, so the strings can be
// unit-tested without rendering React.
//
// Two rules run through the whole file:
//  1. Never invent a number. A node that predates the price service omits the
//     source fields entirely; the honest answer is then "no reference known",
//     not a zero or a guess.
//  2. `fallback` / `demo-fallback` is the deterministic demo price, not a
//     market. Pairs priced that way are labelled as demo rates and their
//     "not sponsored" warning is suppressed — the batcher sponsors unpriced
//     tokens (BATCHER_SPONSOR_UNPRICED=allow), so warning about them would lie.

import type { PricesResponse, Quote, TokenPrice } from '../services/api';
import { fmtAge, fmtOffsetPct, isMarketSource, pct1, type PriceSource } from './format';

/** Human name for a price source. null for the demo price — it is not a market. */
export function sourceLabel(s: PriceSource | string | null | undefined): string | null {
  switch (s) {
    case 'feed': return 'CoinGecko';
    case 'seed': return 'CoinGecko snapshot';
    case 'fixed': return 'pegged';
    case 'manual': return 'operator';
    default: return null;
  }
}

/** "CoinGecko" for one source, "CoinGecko + pegged" when the two sides differ. */
function joinLabels(a: string | null, b: string | null): string | null {
  if (a && b) return a === b ? a : `${a} + ${b}`;
  return a ?? b;
}

/** English list of one or two token names: "TESTTOKENA and TESTTOKENB". */
function nameList(names: string[]): string {
  const uniq = names.filter((n, i) => n && names.indexOf(n) === i);
  if (uniq.length === 0) return 'this pair';
  if (uniq.length === 1) return uniq[0];
  return `${uniq.slice(0, -1).join(', ')} and ${uniq[uniq.length - 1]}`;
}

/** Everything the Swap screen says about a quote's reference price. */
export interface QuoteReference {
  /** Both legs carry a real reference price (feed/seed/fixed/manual). */
  marketBacked: boolean;
  /** The reference rate to display, or null when there is no reference. */
  referenceRate: number | null;
  /** The maker's offset from the reference, e.g. "−2.5%". */
  offset: string | null;
  /** true when the maker's rate is at or below the reference (good for a taker,
   *  rendered in the positive colour, matching the pre-existing convention). */
  offsetBelow: boolean | null;
  /** "sponsored at ≥ 2.5% below reference", when the node publishes the threshold. */
  thresholdText: string | null;
  /** "Reference: CoinGecko · 3 h ago", or the demo-rate sentence. */
  sourceText: string | null;
  /** Warning text with the actual numbers; null when they are not known. */
  notSponsoredText: string | null;
  /** Whether to show the not-sponsored warning at all. */
  showNotSponsored: boolean;
}

/**
 * Describe a quote's reference price for display.
 *
 * `fromName`/`toName` are the token names shown to the user; `now` is injected
 * so the age string is testable.
 */
export function describeQuote(
  q: Quote,
  fromName: string,
  toName: string,
  now: number = Date.now(),
): QuoteReference {
  const fromSrc = q.from_source;
  const toSrc = q.to_source;
  const haveSources = fromSrc != null && toSrc != null;

  // Without per-leg sources (a node older than kernel 00005 part A) the only
  // signal is the pre-existing top-level `source`, which says "demo-fallback"
  // when the node had to fabricate a price for at least one side.
  const marketBacked = haveSources
    ? isMarketSource(fromSrc) && isMarketSource(toSrc)
    : q.source !== 'demo-fallback';

  const referenceRate =
    marketBacked && typeof q.market_rate === 'number' && isFinite(q.market_rate) && q.market_rate > 0
      ? q.market_rate
      : null;

  const offset = fmtOffsetPct(q.implied_rate, referenceRate);
  const offsetBelow =
    q.implied_rate != null && referenceRate != null ? q.implied_rate <= referenceRate : null;

  const thresholdText =
    marketBacked && q.sponsor_discount != null
      ? `sponsored at ≥ ${pct1(q.sponsor_discount)}% below reference`
      : null;

  let sourceText: string | null = null;
  if (!marketBacked) {
    const unpriced = haveSources
      ? [isMarketSource(fromSrc) ? '' : fromName, isMarketSource(toSrc) ? '' : toName].filter(Boolean)
      : [];
    sourceText =
      `Demo rate — no market price for ${nameList(unpriced)}; ` +
      'test tokens are sponsored regardless';
  } else if (haveSources) {
    const label = joinLabels(sourceLabel(fromSrc), sourceLabel(toSrc));
    const age = fmtAge(q.prices_updated_at, now);
    if (label) sourceText = age ? `Reference: ${label} · ${age}` : `Reference: ${label}`;
  }

  const showNotSponsored = !q.sponsored && marketBacked;
  let notSponsoredText: string | null = null;
  if (showNotSponsored && q.discount != null && q.sponsor_discount != null) {
    const need = pct1(q.sponsor_discount);
    const d = Number(pct1(q.discount));
    notSponsoredText =
      d > 0
        ? `This price is only ${d.toFixed(1)}% below reference; sponsorship needs ≥ ${need}%.`
        : d < 0
          ? `This price is ${Math.abs(d).toFixed(1)}% above reference; sponsorship needs ≥ ${need}% below.`
          : `This price is at the reference; sponsorship needs ≥ ${need}% below.`;
  }

  return {
    marketBacked,
    referenceRate,
    offset,
    offsetBelow,
    thresholdText,
    sourceText,
    notSponsoredText,
    showNotSponsored,
  };
}

/** The `/v1/prices` row for one token colour, or null when it is not priced. */
export function tokenPriceOf(
  prices: PricesResponse | null | undefined,
  color: string | null | undefined,
): TokenPrice | null {
  if (!prices || !color) return null;
  return prices.tokens.find((t) => t.token_color === color) ?? null;
}

/** A pair's reference rate, derived from two token prices. */
export interface PairReference {
  /** How many quote units one base unit is worth at reference prices. */
  rate: number;
  /** "CoinGecko", "CoinGecko + pegged", … */
  label: string;
  /** Older of the two rows' timestamps — the age the pair can honestly claim. */
  updatedAt: string | null;
}

/**
 * Reference rate for a pair: price(base) / price(quote), both per base unit, so
 * the result is directly "1 base = rate quote".
 *
 * Returns null unless BOTH tokens carry a market-backed price. `price_usd` is a
 * decimal string; it is parsed to a double here because this is a display ratio
 * and an offset threshold, never a settlement amount.
 */
export function referenceRate(
  prices: PricesResponse | null | undefined,
  baseColor: string | null | undefined,
  quoteColor: string | null | undefined,
): PairReference | null {
  const b = tokenPriceOf(prices, baseColor);
  const q = tokenPriceOf(prices, quoteColor);
  if (!b || !q) return null;
  if (!isMarketSource(b.source) || !isMarketSource(q.source)) return null;
  const bp = Number(b.price_usd);
  const qp = Number(q.price_usd);
  if (!isFinite(bp) || !isFinite(qp) || qp <= 0 || bp <= 0) return null;
  const label = joinLabels(sourceLabel(b.source), sourceLabel(q.source));
  if (!label) return null;
  const older = [b.updated_at, q.updated_at]
    .filter((s): s is string => !!s)
    .sort()[0] ?? null;
  return { rate: bp / qp, label, updatedAt: older };
}
