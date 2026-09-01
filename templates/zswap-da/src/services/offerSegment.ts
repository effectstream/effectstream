// Put a new offer's Intent on a RANDOM transaction segment, so unshielded-leg
// offers can be taken as a ladder.
//
// Why this exists. An offer carries an Intent exactly when it has an unshielded
// leg: the wallet facade's `initSwap` only builds an unshielded half when there
// are unshielded inputs or outputs, and that half is
// `Transaction.fromParts(networkId, undefined, undefined, intent)` — which
// ALWAYS lands the Intent at segment 1. Ledger `merge` keys intents by segment
// id, so two such offers refuse to compose:
//
//   key (segment_id) collision during intents merge: 1
//
// Taking several offers in one action means merging their maker halves
// (services/offerBatch.ts), so under that rule a ladder could hold at most ONE
// unshielded-leg offer. The ledger's own answer is `fromPartsRandomized`,
// documented as existing "to better allow merging"; this module applies the same
// idea to the transaction the facade has already built.
//
// Why it can only happen HERE, at creation time:
//   - re-segmenting requires an UNPROVEN, UNBOUND transaction — a published
//     offer blob decodes to a bound, proven one ("Transaction is already
//     bound."), so a taker can never repair a collision;
//   - it must precede signing — `Intent.signatureData(segment)` is
//     segment-dependent (verified: the payload for segment 1 differs from the
//     payload for segment 4242), so a signature taken before the move would not
//     cover the segment the transaction ends up carrying.
//
// Everything downstream is already segment-agnostic and stays untouched: the
// wallet's own signing service signs whatever segments `tx.intents` holds
// (`collectSignableData` → `intent.signatureData(thatSegment)`), the taker's
// `balanceFinalizedTransaction` picks its own slot with
// `findAvailableSegmentId` (the first unused id in 1..65535), and this
// template's readers (`offerParse.parseTakerLegs`, `offerSender.parseOfferSender`,
// `offerBatch.pickSwapSegment`/`chooseLaceBalancing`, `decodeOffer`) all
// enumerate `intents.keys()` rather than assuming 1.
//
// Nothing is imported here on purpose. The transaction handed to us belongs to
// whichever ledger wasm module the facade was built against, and wasm-bindgen
// classes carry per-instance type identity — so this module only uses the
// instance's own documented API (`intents`, `addIntent`), which both ledger-v8
// and ledger-v9 expose identically. Keeping it dependency-free is also what
// makes it unit-testable without a wallet, a network or a browser, the same
// discipline services/offerBatch.ts follows.

/**
 * Lowest segment id a new offer's Intent may take.
 *
 * 0 is the guaranteed section (never an Intent slot) and 1 is where
 * `Transaction.fromParts` — and Lace's unshielded `makeIntent` — put theirs, so
 * both are excluded by construction: an offer that took 1 would be no more
 * mergeable than the offers this module exists to replace.
 */
export const INTENT_SEGMENT_MIN = 2;

/**
 * Highest segment id a new offer's Intent may take.
 *
 * Segment ids are 16-bit: the wallet SDK's own `findAvailableSegmentId` scans
 * `1..65535`, and the ledger's `fromPartsRandomized` was sampled 400 times on
 * both ledger-v8 and ledger-v9 and never produced 0, 1, or a value above 65535
 * (observed 120…65465). So `2..65535` is the ledger's own space minus the two
 * reserved slots.
 */
export const INTENT_SEGMENT_MAX = 65535;

/**
 * A uniform segment id in `[INTENT_SEGMENT_MIN, INTENT_SEGMENT_MAX]`.
 *
 * Rejection sampling on a 16-bit draw rather than a modulo, so the distribution
 * is exactly uniform across the 65,534 usable ids. Two offers in one ladder
 * collide with probability 1/65534; that residual case is caught — before
 * anything is submitted — by the same guard that catches legacy segment-1 pairs
 * (services/offerBatch.ts).
 */
export function randomIntentSegmentId(): number {
  const buf = new Uint16Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const id = buf[0]!;
    if (id >= INTENT_SEGMENT_MIN && id <= INTENT_SEGMENT_MAX) return id;
  }
}

/** One Intent's relocation, for logging and tests. */
export interface SegmentMove {
  from: number;
  to: number;
}

/**
 * Move every Intent on an UNPROVEN, UNBOUND transaction to a fresh random
 * segment id, and return the rebuilt transaction.
 *
 * A shielded-only offer has no Intent at all, so it comes back untouched (by
 * identity) with no moves — that path is structurally unchanged.
 *
 * The facade produces exactly one Intent, at segment 1; the loop is written for
 * the map because that is what the ledger exposes, and it keeps the chosen ids
 * distinct so a multi-Intent transaction could not collide with itself.
 *
 * @param unprovenTx A ledger `Transaction` in the unproven, unbound state.
 * @param pick Segment-id source; injectable so tests can force a value.
 * @throws Whatever `addIntent` throws — notably "Transaction is already bound."
 * if this is ever called after proving or binding, which is the failure mode we
 * WANT to be loud.
 */
export function randomizeIntentSegments(
  unprovenTx: any,
  pick: () => number = randomIntentSegmentId,
): { tx: any; moves: SegmentMove[] } {
  const intents = unprovenTx?.intents as Map<number, unknown> | undefined;
  if (!intents || intents.size === 0) return { tx: unprovenTx, moves: [] };

  // Snapshot before mutating: `addIntent` rebuilds the transaction, and the
  // Intent values have to be held onto across the removal.
  const held = Array.from(intents.entries());

  let tx = unprovenTx;
  for (const [from] of held) {
    tx = tx.addIntent({ tag: 'specific', value: from }, undefined);
  }

  const moves: SegmentMove[] = [];
  const taken = new Set<number>();
  for (const [from, intent] of held) {
    let to = pick();
    while (taken.has(to)) to = pick();
    taken.add(to);
    tx = tx.addIntent({ tag: 'specific', value: to }, intent);
    moves.push({ from, to });
  }

  return { tx, moves };
}

/** What {@link randomizeRecipeIntentSegment} did, so the caller can log it. */
export interface RecipeResegmentResult<T> {
  recipe: T;
  moves: SegmentMove[];
  /** Set when the recipe was not an unproven transaction — nothing was moved. */
  skipped?: 'not-an-unproven-recipe';
}

/**
 * {@link randomizeIntentSegments} applied to a wallet-facade balancing recipe —
 * the shape `facade.initSwap` returns
 * (`{ type: 'UNPROVEN_TRANSACTION', transaction, blockData? }`).
 *
 * The recipe is returned unchanged, by identity, in the two cases where there is
 * nothing to do: a shielded-only offer (no Intent) and any recipe that is not an
 * unproven transaction. Only an unproven transaction can be re-segmented at all,
 * and publishing an offer at segment 1 is a far better outcome than mangling a
 * shape this function did not expect.
 */
export function randomizeRecipeIntentSegment<T extends { type?: string; transaction?: any }>(
  recipe: T,
  pick: () => number = randomIntentSegmentId,
): RecipeResegmentResult<T> {
  if (recipe?.type !== 'UNPROVEN_TRANSACTION' || !recipe.transaction) {
    return { recipe, moves: [], skipped: 'not-an-unproven-recipe' };
  }

  const { tx, moves } = randomizeIntentSegments(recipe.transaction, pick);
  // Shielded-only offer: no Intent, nothing moved, same recipe object.
  if (moves.length === 0) return { recipe, moves };

  return { recipe: { ...recipe, transaction: tx }, moves };
}
