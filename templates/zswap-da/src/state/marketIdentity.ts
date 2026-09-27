import type { TokenPrivacy } from '../services/tokenMetadata';
import { scaleRate } from './amount';

export interface MarketPairIdentity {
  baseColor: string;
  quoteColor: string;
  baseKind?: TokenPrivacy;
  quoteKind?: TokenPrivacy;
}

export interface MarketOrderIdentity {
  fromColor: string;
  toColor: string;
  fromKind: TokenPrivacy;
  toKind: TokenPrivacy;
}

/**
 * A color-only chart and a kind-aware live book may use different decimal
 * scales for the same colors. Keep the displayed historical reference in the
 * chart scale, while comparing live depth only with a reference converted to
 * the selected native identities' scale.
 */
export function marketReferenceRates(
  baseUnitRate: number,
  historicalDecimals: { base: number; quote: number },
  liveDecimals?: { base: number; quote: number },
): { historical: number; live: number | null } {
  return {
    historical: scaleRate(baseUnitRate, historicalDecimals.base, historicalDecimals.quote),
    live: liveDecimals ? scaleRate(baseUnitRate, liveDecimals.base, liveDecimals.quote) : null,
  };
}

/**
 * Actionable depth requires the complete native identities. A color-only pair
 * from historical APIs can still show its chart, but can never wildcard-match
 * live offers from one or both privacy kinds.
 */
export function marketOrderSide(
  order: MarketOrderIdentity,
  pair: MarketPairIdentity,
): 'ask' | 'bid' | null {
  if (!pair.baseKind || !pair.quoteKind) return null;
  if (
    order.fromColor === pair.baseColor && order.toColor === pair.quoteColor &&
    order.fromKind === pair.baseKind && order.toKind === pair.quoteKind
  ) return 'ask';
  if (
    order.fromColor === pair.quoteColor && order.toColor === pair.baseColor &&
    order.fromKind === pair.quoteKind && order.toKind === pair.baseKind
  ) return 'bid';
  return null;
}
