// Which offers of a ladder the taker actually wants — the pure half of the
// take-confirm dialog's checkbox list.
//
// A price level aggregates every offer at that price, and the dialog used to be
// all-or-nothing: the only escape from a batch you couldn't fully fund was the
// "take the affordable prefix" button. Now every row has a checkbox, and the
// totals, the affordability verdict and the CTA are recomputed from whatever is
// checked — which is exactly what this module does, without React or a wallet.

import type { ParsedLeg } from './offerParse';
import type { KnownToken } from '../types';
import { DEFAULT_DECIMALS } from '../state/amount';
import { affordableIndices, shortfallMessage, shortfallsFromLegs, sumLegs } from './takerBalance';

/**
 * One selectable offer of a take.
 *
 * `pay.amt`/`receive.amt` are BASE UNITS as floats (the book's own unit) with
 * the token's `decimals` beside them; the caller renders coins. Totals are
 * summed in base units on purpose — integers add exactly below 2^53, whereas
 * summing already-divided coins would drift across a deep ladder. `pays`
 * carries the exact bigint legs the balance check needs.
 */
export interface SelectableOffer {
  id: string;
  pay: { sym: string; amt: number; decimals?: number };
  receive: { sym: string; amt: number; decimals?: number };
  /** Legs the taker must SUPPLY for this offer. Empty for an undecodable blob,
   *  which then contributes no cost — the settle path surfaces those. */
  pays: ParsedLeg[];
  /** This offer is the connected wallet's own (marked in the list). */
  mine?: boolean;
}

export interface TakerBalances {
  shielded?: Record<string, string> | null;
  unshielded?: Record<string, string> | null;
}

export interface TakeSummary {
  count: number;
  /** Totals in BASE UNITS, with the precision needed to render them as coins. */
  pay: { sym: string; amt: number; decimals: number };
  receive: { sym: string; amt: number; decimals: number };
  /** Why the checked set can't be funded, or null. */
  blocked: string | null;
  cta: string;
}

const idsOf = (items: SelectableOffer[]): string[] => items.map((i) => i.id);

/**
 * The offers that fit the wallet when taken TOGETHER, in the given order (the
 * book hands them over best-price-first, so this is the best affordable prefix).
 * The aggregate is what matters: each offer on its own can look affordable while
 * the batch overspends.
 */
export function affordableSelection(items: SelectableOffer[], balances: TakerBalances): string[] {
  const idx = new Set(affordableIndices(items.map((i) => i.pays), balances.shielded, balances.unshielded));
  return items.filter((_, i) => idx.has(i)).map((i) => i.id);
}

/**
 * What starts checked: everything the wallet can cover.
 *
 * When it can cover NOTHING, everything starts checked instead of nothing — an
 * empty dialog with a disabled CTA and no explanation is worse than a full one
 * showing the shortfall the user has to fix.
 */
export function defaultSelection(items: SelectableOffer[], balances: TakerBalances): string[] {
  const affordable = affordableSelection(items, balances);
  return affordable.length > 0 ? affordable : idsOf(items);
}

/**
 * Totals, affordability and CTA for the checked subset. Called on every toggle,
 * so it stays a pure fold over the items — no decoding, no network.
 */
export function summarize(
  items: SelectableOffer[],
  checkedIds: Iterable<string>,
  balances: TakerBalances,
  knownTokens: KnownToken[] = [],
): TakeSummary {
  const checked = new Set(checkedIds);
  const sel = items.filter((i) => checked.has(i.id));
  const n = sel.length;
  // Symbols come from the selection when there is one, else from the first row,
  // so an empty selection still renders the pair instead of blanking the dialog.
  const shape = sel[0] ?? items[0];
  const blocked = n === 0
    ? null
    : shortfallMessage(
        shortfallsFromLegs(sumLegs(sel.map((i) => i.pays)), balances.shielded, balances.unshielded, knownTokens),
      );
  return {
    count: n,
    pay: {
      sym: shape?.pay.sym ?? '—',
      amt: sel.reduce((s, i) => s + i.pay.amt, 0),
      decimals: shape?.pay.decimals ?? DEFAULT_DECIMALS,
    },
    receive: {
      sym: shape?.receive.sym ?? '—',
      amt: sel.reduce((s, i) => s + i.receive.amt, 0),
      decimals: shape?.receive.decimals ?? DEFAULT_DECIMALS,
    },
    blocked,
    // The CTA states the size of the commitment; with nothing checked it names
    // what's missing rather than offering "Take 0 offers".
    cta: n === 0 ? 'Select an offer' : n === 1 ? 'Take offer' : `Take ${n} offers`,
  };
}
