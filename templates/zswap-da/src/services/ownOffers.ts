// "Some of these offers are yours" — the pure part of the take path's own-offer
// handling, kept out of the React hook so it can be tested without a wallet.
//
// Taking your own offer is legal on-chain (maker = taker), so this is a WARNING,
// never a block. It used to be neither: `requestTakeMany` silently opened the
// "Connect a wallet" modal when every selected offer was flagged mine, which
// with a per-browser ownership record was a dead end for anyone testing two
// wallets in one browser (issue 00003).
//
// Ownership itself is decided by the caller and handed in as a predicate,
// because it comes from two different places: the on-device record (the only
// signal a shielded offer has) and — once the blob is loaded — the offer's
// unshielded sender.

/** The selection split by ownership. `all` keeps the caller's original order,
 *  which is significant: the book hands offers over best-price-first and the
 *  affordability prefix depends on it. */
export interface OwnOfferSplit<T> {
  all: T[];
  mine: T[];
  others: T[];
}

export function partitionOwn<T>(items: T[], isMine: (item: T) => boolean): OwnOfferSplit<T> {
  const mine: T[] = [];
  const others: T[] = [];
  for (const item of items) (isMine(item) ? mine : others).push(item);
  return { all: items, mine, others };
}

/** What the user picked in the decision dialog. */
export type OwnOfferChoice = 'take-all' | 'skip-mine' | 'cancel';

export interface OwnOfferDecision {
  /** `none` = nothing of yours in the selection, so don't ask at all. */
  kind: 'none' | 'all-mine' | 'mixed';
  mine: number;
  total: number;
  /** Dialog body, or null when there is nothing to ask. */
  message: string | null;
  /** Offered choices, in display order. Always ends with `cancel`. */
  choices: OwnOfferChoice[];
}

/**
 * Decide what (if anything) to ask before taking this selection.
 *
 * `skip-mine` is only ever offered when something would remain to take — an
 * option that continues with an empty selection would just be a confusing
 * second Cancel (FR-005).
 */
export function decideOwnOffers<T>(split: OwnOfferSplit<T>): OwnOfferDecision {
  const mine = split.mine.length;
  const total = split.all.length;
  if (mine === 0) return { kind: 'none', mine, total, message: null, choices: [] };
  if (split.others.length === 0) {
    return {
      kind: 'all-mine',
      mine,
      total,
      message: mine === 1
        ? 'This is your own offer. Take it anyway?'
        : `All ${mine} selected offers are yours. Take them anyway?`,
      choices: ['take-all', 'cancel'],
    };
  }
  return {
    kind: 'mixed',
    mine,
    total,
    message: `${mine} of ${total} selected offers are yours. Skip them, or take them too?`,
    choices: ['skip-mine', 'take-all', 'cancel'],
  };
}

/**
 * The offers to continue with for a choice — `null` means "stop, settle
 * nothing" (Cancel, or a choice that would leave an empty selection).
 */
export function applyOwnOfferChoice<T>(split: OwnOfferSplit<T>, choice: OwnOfferChoice): T[] | null {
  if (choice === 'cancel') return null;
  const next = choice === 'skip-mine' ? split.others : split.all;
  return next.length > 0 ? next : null;
}

/** Button label for a choice — one place, so dialog and tests can't drift. */
export function ownOfferChoiceLabel(choice: OwnOfferChoice, decision: OwnOfferDecision): string {
  if (choice === 'cancel') return 'Cancel';
  if (choice === 'skip-mine') return 'Skip mine';
  return decision.kind === 'mixed'
    ? 'Include mine'
    : decision.mine === 1 ? 'Take anyway' : 'Take them anyway';
}
