// Fold a ladder of maker offers into ONE settlement.
//
// Taking N offers used to mean N separate settlements, back to back. The
// taker's JS wallet usually holds a single coin per token, and nothing tells it
// about take #k's spend before take #k+1 is balanced — the template submits
// through the batcher, not `facade.submitTransaction`, so the facade's coin
// selection still offers up the coin that was just spent. The node saw the same
// nullifier twice and rejected the second settlement with
// `Zswap(NullifierAlreadyPresent)`: only the first offer of a ladder was ever
// bought.
//
// ZSwap offers are built to compose. An offer blob decodes to a finalized,
// deliberately imbalanced maker transaction, and ledger `merge` places two of
// them side by side — the batcher already merges its dust intent into every
// transaction, and `finalizeRecipe` merges the taker's balancing half into the
// maker's. Folding the N maker halves FIRST and balancing the result once means
// one coin selection, one proof pass, one dust fee and one submission: the
// double-spend window is removed rather than waited out.
//
// The one limit is segment ids. The facade builds an offer's unshielded half
// with `Transaction.fromParts`, which always lands its Intent at segment 1, and
// `merge` refuses two transactions that both occupy it ("key (segment_id)
// collision during intents merge: 1"). Shielded-only offers carry no Intent at
// all, so they always compose. Re-segmenting is not an option on this side: it
// needs an unproven transaction, and a maker blob decodes to a bound one
// ("Transaction is already bound."). A batch that would collide is therefore
// rejected HERE, before anything is submitted — a ladder settles whole or not
// at all.

import { Transaction as LedgerV8Transaction } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';
import { parseTakerLegs } from './offerParse';

/**
 * A decoded maker half, kept alongside the blob it came from so a failure can
 * name the offer that caused it.
 */
export interface DecodedMakerOffer {
  blob: string;
  /** ledger-v8 `Transaction<'signature','proof','binding'>`. */
  tx: any;
  /** Size of the decoded maker transaction, for the debug log. */
  bytes: number;
}

const reason = (e: unknown): string => {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m.length > 0 ? m : String(e);
};

/**
 * Decode every blob in the batch up front. Nothing is submitted until all of
 * them are readable, so a bad blob costs the user a message rather than a
 * half-filled ladder.
 *
 * @throws If the batch is empty, or if any blob fails to decode.
 */
export function decodeMakerOffers(blobs: string[], networkId: NetworkId): DecodedMakerOffer[] {
  if (blobs.length === 0) throw new Error('No offers to settle.');
  setNetworkId(networkId);
  return blobs.map((blob, i) => {
    try {
      const raw = OfferFiles.decode(blob);
      return {
        blob,
        tx: LedgerV8Transaction.deserialize('signature', 'proof', 'binding', raw),
        bytes: raw.length,
      };
    } catch (cause) {
      throw new Error(
        blobs.length === 1
          ? `This offer could not be read: ${reason(cause)}`
          : `Offer ${i + 1} of ${blobs.length} could not be read: ${reason(cause)}. Nothing was submitted.`,
        { cause },
      );
    }
  });
}

/**
 * Turn a ledger merge failure into something a taker can act on. The two
 * documented causes are a segment collision (`merge`'s intents map is keyed by
 * segment id) and two offers spending the same coin — in both cases the offers
 * are mutually exclusive as a batch, and taking them one at a time is the
 * answer.
 */
function mergeFailureMessage(cause: unknown, count: number): string {
  const detail = reason(cause);
  if (/segment_id|intents merge/i.test(detail)) {
    return (
      `These ${count} offers can't be settled together — two of them occupy the same ` +
      `transaction segment (${detail}). Offers with an unshielded leg are always built ` +
      `at segment 1, so only one of those fits in a batch. Take them one at a time. ` +
      `Nothing was submitted.`
    );
  }
  if (/same coins?|spend the same/i.test(detail)) {
    return (
      `These ${count} offers can't be settled together — two of them spend the same coin, ` +
      `so only one of them can ever be taken. Take them one at a time. Nothing was submitted.`
    );
  }
  return (
    `These ${count} offers can't be merged into one settlement (${detail}). ` +
    `Take them one at a time. Nothing was submitted.`
  );
}

/**
 * Fold the maker halves into a single transaction. N=1 returns the one decoded
 * transaction untouched, so a single take runs exactly the pipeline it always
 * did.
 *
 * @throws If the batch is empty, or if two offers cannot compose.
 */
export function mergeMakerOffers(decoded: DecodedMakerOffer[]): any {
  if (decoded.length === 0) throw new Error('No offers to settle.');
  let merged = decoded[0]!.tx;
  for (let i = 1; i < decoded.length; i++) {
    try {
      merged = merged.merge(decoded[i]!.tx);
    } catch (cause) {
      throw new Error(mergeFailureMessage(cause, decoded.length), { cause });
    }
  }
  return merged;
}

/**
 * Does the taker pay an unshielded leg anywhere in this batch?
 *
 * Unshielded inputs are signed, and the signature covers the segment, so
 * `signRecipe` has to run before `finalizeRecipe` binds the settlement.
 * Omitting it is not an immediate error — the node rejects the settlement later
 * with SIGNATURE_INVALID — so an unreadable blob counts as "yes" here, matching
 * what the single-offer path has always done.
 */
export function batchPaysUnshielded(blobs: string[], networkId: NetworkId): boolean {
  return blobs.some((blob) => {
    const parsed = parseTakerLegs(blob, networkId);
    return parsed?.pays.some((l) => l.kind === 'unshielded') ?? true;
  });
}
