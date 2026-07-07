// Balance-awareness for taking (completing) an offer. A taker must SUPPLY the
// offer's `pays` legs; if the wallet doesn't hold them, Lace's `makeIntent`
// hangs forever instead of erroring (see browserContract.ts). These helpers let
// the UI check up front and refuse to start an unfundable settle.
//
// Units line up exactly: `pays[].amount` is a raw bigint and wallet balances are
// raw integer strings keyed by token color — so the check is a direct BigInt
// comparison, no decimal scaling.

import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { KnownToken } from '../types';
import { parseTakerLegs, type ParsedLeg } from './offerParse';
import { findTokenName, shortToken } from '../utils';

export interface Shortfall {
  color: string;
  kind: 'shielded' | 'unshielded';
  need: bigint;
  have: bigint;
  sym: string;
}

type Balances = Record<string, string> | null | undefined;

// Parse a raw balance string ("1000", possibly comma-grouped) to bigint. Never
// throws — an unparseable balance counts as zero (safe: it can only over-block).
function toBig(raw: string | undefined): bigint {
  if (raw == null) return 0n;
  try {
    return BigInt(String(raw).replace(/,/g, '').split('.')[0] || '0');
  } catch {
    return 0n;
  }
}

/**
 * Pure core: given the taker's `pays` legs and balances, return the legs the
 * wallet can't cover. Separated from blob decoding so it's unit-testable.
 */
export function shortfallsFromLegs(
  pays: ParsedLeg[],
  shieldedBalances: Balances,
  unshieldedBalances: Balances,
  knownTokens: KnownToken[] = [],
): Shortfall[] {
  const out: Shortfall[] = [];
  for (const leg of pays) {
    const map = leg.kind === 'shielded' ? shieldedBalances : unshieldedBalances;
    const have = toBig(map?.[leg.color]);
    if (have < leg.amount) {
      out.push({
        color: leg.color,
        kind: leg.kind,
        need: leg.amount,
        have,
        sym: findTokenName(leg.color, knownTokens) ?? shortToken(leg.color),
      });
    }
  }
  return out;
}

/**
 * Return the taker `pays` legs the wallet can't cover for this offer blob.
 * Empty array = fully fundable, OR the blob is undecodable / has no pays legs
 * (we don't block on those — the existing settle path surfaces such cases).
 */
export function takerShortfalls(
  blob: string,
  shieldedBalances: Balances,
  unshieldedBalances: Balances,
  networkId: NetworkId,
  knownTokens: KnownToken[] = [],
): Shortfall[] {
  const parsed = parseTakerLegs(blob, networkId);
  if (!parsed) return [];
  return shortfallsFromLegs(parsed.pays, shieldedBalances, unshieldedBalances, knownTokens);
}

/** One-line reason for the first shortfall, for a disabled CTA / toast. */
export function shortfallMessage(shortfalls: Shortfall[]): string | null {
  if (shortfalls.length === 0) return null;
  const [first] = shortfalls;
  const more = shortfalls.length > 1 ? ` (+${shortfalls.length - 1} more)` : '';
  return `Insufficient ${first.sym}: need ${first.need.toString()}, have ${first.have.toString()}${more}`;
}
