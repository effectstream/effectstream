// The Swap screen's amount decisions, extracted from the component so they can
// be unit-tested without a DOM.
//
// Swap.tsx is the boundary between the two units this app deals in: WHOLE COINS
// above (what the user types, what the balance chip and the rate lines say) and
// BASE UNITS below (what `/v1/quote` takes, what the offer legs carry, what the
// chain settles). Each leg converts with ITS OWN token's `decimals` — a pair is
// routinely two different precisions — so every function here takes the token,
// not a global.

import {
  DEFAULT_DECIMALS,
  formatBaseUnits,
  parseAmount,
  parseBaseUnits,
  scaleRate,
  type ParsedAmount,
} from './amount';
import type { KnownToken } from '../types';

/** Precision of a leg's token; the app default before one is picked. */
export function legDecimals(token: KnownToken | null | undefined): number {
  return token?.decimals ?? DEFAULT_DECIMALS;
}

/**
 * Parse one leg's typed whole-coin amount into base units, at that leg's own
 * precision. The `error` explains a refusal well enough to name the token's
 * precision back to the user — over-precision is never rounded away.
 */
export function parseLeg(raw: string, token: KnownToken | null | undefined): ParsedAmount {
  return parseAmount(raw, legDecimals(token));
}

/**
 * The value the "You receive" field should show for the node's auto-price
 * suggestion. `suggested_to_amount` is base units of the TO token; the field is
 * coins. Exact (`formatBaseUnits`, not the grouped/rounded display form), so
 * submitting the suggestion posts exactly what the node suggested.
 */
export function suggestedFieldValue(
  suggestedBaseUnits: string | number | bigint,
  token: KnownToken | null | undefined,
): string {
  return formatBaseUnits(suggestedBaseUnits, legDecimals(token));
}

/**
 * Can the maker cover the amount it is offering to pay?
 *
 * Both sides are BASE UNITS — the wallet reports raw integer strings and `need`
 * came out of `parseLeg` — so no scaling happens here and the comparison stays
 * in bigint. Going through Number() could round two distinct amounts onto the
 * same double and let an unaffordable offer through. A missing balance is zero.
 */
export function hasBalanceFor(need: bigint | null, balance: string | null | undefined): boolean {
  if (need == null || need <= 0n) return true;
  return parseBaseUnits(balance) >= need;
}

/**
 * A rate the node published (`implied_rate`, `market_rate`) → the whole-coin
 * rate the screen prints as "1 FROM = X TO".
 *
 * The node's rates are base units of TO per base unit of FROM, so this is
 * `× 10^(dFrom − dTo)`: the identity while every token is 6, and the reason a
 * future 8-decimals token still reads right. Percentages derived from two such
 * rates (the offset from reference, the sponsorship discount) are ratios and
 * need no scaling at all.
 */
export function displayRate(
  rate: number | null | undefined,
  from: KnownToken | null | undefined,
  to: KnownToken | null | undefined,
): number {
  return rate == null ? 0 : scaleRate(rate, legDecimals(from), legDecimals(to));
}
