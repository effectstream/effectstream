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

/**
 * Sum the `pays` legs across many offer blobs into one leg per (kind, color).
 * Undecodable blobs are skipped. Used to check a whole batch against the wallet
 * in a single comparison — checking each offer against the full balance would
 * wrongly pass a batch that only overspends in aggregate.
 */
export function aggregatePays(blobs: string[], networkId: NetworkId): ParsedLeg[] {
  const need = new Map<string, ParsedLeg>();
  for (const blob of blobs) {
    const parsed = parseTakerLegs(blob, networkId);
    if (!parsed) continue;
    for (const leg of parsed.pays) {
      const key = `${leg.kind}:${leg.color}`;
      const cur = need.get(key);
      if (cur) cur.amount += leg.amount;
      else need.set(key, { ...leg });
    }
  }
  return [...need.values()];
}

/** Aggregate `pays` across a batch of blobs, then return the uncovered legs. */
export function batchTakerShortfalls(
  blobs: string[],
  shieldedBalances: Balances,
  unshieldedBalances: Balances,
  networkId: NetworkId,
  knownTokens: KnownToken[] = [],
): Shortfall[] {
  return shortfallsFromLegs(aggregatePays(blobs, networkId), shieldedBalances, unshieldedBalances, knownTokens);
}

/**
 * Greedily pick the offers (by their `pays` legs, in the given order — the book
 * is already best-price-first) the wallet can afford when their cost accumulates.
 * An offer is included only if adding it keeps EVERY (kind, color) within balance.
 * Conservative: sums pays, ignores receives. The taker's balancing side is built
 * by coin selection over the wallet's own state, so what an offer in the batch
 * pays out to the taker cannot fund another offer in the same settlement.
 * Returns the indices to take.
 */
export function affordableIndices(
  offerPays: ParsedLeg[][],
  shieldedBalances: Balances,
  unshieldedBalances: Balances,
): number[] {
  const spent = new Map<string, bigint>();
  const idxs: number[] = [];
  for (let i = 0; i < offerPays.length; i++) {
    const trial = new Map(spent);
    let fits = true;
    for (const leg of offerPays[i]) {
      const key = `${leg.kind}:${leg.color}`;
      const next = (trial.get(key) ?? 0n) + leg.amount;
      const map = leg.kind === 'shielded' ? shieldedBalances : unshieldedBalances;
      if (toBig(map?.[leg.color]) < next) { fits = false; break; }
      trial.set(key, next);
    }
    if (fits) { idxs.push(i); spent.clear(); trial.forEach((v, k) => spent.set(k, v)); }
  }
  return idxs;
}

/** One-line reason for the first shortfall, for a disabled CTA / toast. */
export function shortfallMessage(shortfalls: Shortfall[]): string | null {
  if (shortfalls.length === 0) return null;
  const [first] = shortfalls;
  const more = shortfalls.length > 1 ? ` (+${shortfalls.length - 1} more)` : '';
  return `Insufficient ${first.sym}: need ${first.need.toString()}, have ${first.have.toString()}${more}`;
}
