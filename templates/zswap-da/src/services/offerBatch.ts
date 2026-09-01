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
// The one limit is segment ids. `merge` keys intents by segment, and refuses
// two transactions that occupy the same one ("key (segment_id) collision during
// intents merge: 1"). Shielded-only offers carry no Intent at all, so they
// always compose; offers with an unshielded leg do carry one, and where it
// lands decides whether they can share a ladder:
//
//   - offers created by THIS template's JS-wallet maker path put it on a random
//     segment (services/offerSegment.ts), so any number of them compose;
//   - offers created before that change, and every Lace-made offer, sit at
//     segment 1 — so at most one of THOSE fits in a batch.
//
// Re-segmenting is not an option on this side: it needs an unproven
// transaction, and a maker blob decodes to a bound one ("Transaction is already
// bound."). A batch that would collide — two legacy offers, or the ~1-in-65534
// case of two random ids matching — is therefore rejected HERE, before anything
// is submitted: a ladder settles whole or not at all.
//
// BOTH wallets fold their ladder through this module. The JS wallet facade
// takes the merged ledger object (services/localTradeOffers.ts); Lace takes its
// serialized bytes and picks a balancing strategy from its shape
// (services/browserContract.ts), which is why `pickSwapSegment` and
// `chooseLaceBalancing` live here too — a merged transaction has to satisfy the
// same dispatch a single offer did, and that is something a unit test can check
// without a wallet in the room.

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
  /**
   * The blob's own decoded bytes, kept so a single-offer take can hand a wallet
   * exactly the bytes it always got rather than a re-serialization of `tx`.
   */
  raw: Uint8Array;
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
        raw,
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
      `transaction segment (${detail}). Older offers with an unshielded leg, and ` +
      `Lace-made ones, all sit at segment 1, so only one of those fits in a batch. ` +
      `Take them one at a time. Nothing was submitted.`
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
 * The folded maker side, plus the serialized form a wallet that speaks bytes
 * (Lace) needs.
 */
export interface MergedMakerBatch {
  /** ledger-v8 transaction — the merged maker half. */
  tx: any;
  /**
   * `tx` as bytes. For a single offer these are the blob's OWN decoded bytes,
   * NOT a re-serialization, so a single take hands the wallet byte-for-byte
   * what it has always been handed.
   */
  bytes: Uint8Array;
}

/**
 * {@link mergeMakerOffers} for a wallet that takes bytes rather than a ledger
 * object.
 *
 * @throws If the batch is empty, or if two offers cannot compose.
 */
export function mergeMakerOffersToBytes(decoded: DecodedMakerOffer[]): MergedMakerBatch {
  const tx = mergeMakerOffers(decoded);
  return { tx, bytes: decoded.length === 1 ? decoded[0]!.raw : tx.serialize() };
}

/**
 * Find the single segment carrying the swap's shielded/unshielded asset
 * imbalances. On a MERGED maker transaction those imbalances are the ladder's
 * sums, which is what makes one balancing pass enough for the whole batch.
 *
 * @throws If no segment carries asset imbalances, or if more than one does —
 * the balancing strategies below each mirror exactly one segment.
 */
export function pickSwapSegment(makerTx: any): { segId: number; imbalances: Map<any, bigint> } {
  // Lace's makeIntent populates `intents` (Intent objects) and may also touch
  // `fallibleOffer` (ZswapOffer). Union them with segment 0 (guaranteed),
  // then keep only segments with non-empty asset imbalances.
  const intentIds: number[] = makerTx.intents
    ? (Array.from(makerTx.intents.keys()) as number[])
    : [];
  const fallibleIds: number[] = makerTx.fallibleOffer
    ? (Array.from(makerTx.fallibleOffer.keys()) as number[])
    : [];
  const candidates = Array.from(new Set<number>([0, ...intentIds, ...fallibleIds]));

  const swaps: Array<{ segId: number; imbalances: Map<any, bigint> }> = [];
  for (const segId of candidates) {
    let imb: Map<any, bigint>;
    try {
      imb = makerTx.imbalances(segId) as Map<any, bigint>;
    } catch {
      continue;
    }
    const hasAssets = Array.from(imb.entries()).some(([tt, v]) => {
      const tag = (tt as any).tag;
      return (tag === 'shielded' || tag === 'unshielded') && v !== 0n;
    });
    if (hasAssets) swaps.push({ segId, imbalances: imb });
  }

  if (swaps.length === 0) {
    throw new Error(
      `Maker offer has no shielded/unshielded asset imbalances — nothing to mirror. ` +
        `(intent ids: ${JSON.stringify(intentIds)}, fallible ids: ${JSON.stringify(fallibleIds)})`,
    );
  }
  if (swaps.length > 1) {
    throw new Error(
      `Multi-segment offers are not supported (asset imbalances in segments ${
        swaps.map(s => s.segId).join(', ')
      }).`,
    );
  }
  return swaps[0]!;
}

/** Which side Lace is asked to build — see services/browserContract.ts. */
export interface LaceBalancing {
  segId: number;
  imbalances: Map<any, bigint>;
  /**
   * `true` → mirror the taker side with `makeIntent` and merge;
   * `false` → hand the sealed maker tx to `balanceSealedTransaction`.
   */
  useMirrorMerge: boolean;
}

/**
 * Pick Lace's balancing strategy from the maker transaction's shape.
 *
 * Mirror+merge requires both halves to have no Intent slots: Lace's unshielded
 * `makeIntent` puts asset deltas in segment 0 but also tacks on an empty
 * Intent[1], and two of those collide on merge — so the segment test alone is
 * not enough, the maker must additionally carry no Intent.
 *
 * A merged shielded↔shielded ladder satisfies both conditions exactly as one
 * shielded offer does (no Intents anywhere, deltas summed in segment 0), which
 * is why merging is safe to hand Lace; `offerBatch.test.ts` asserts that on a
 * genuinely merged transaction rather than trusting the reasoning.
 *
 * @throws Whatever {@link pickSwapSegment} throws.
 */
export function chooseLaceBalancing(makerTx: any): LaceBalancing {
  const swap = pickSwapSegment(makerTx);
  const makerHasIntents = !!makerTx.intents
    && Array.from(makerTx.intents.keys() as Iterable<number>).length > 0;
  return { ...swap, useMirrorMerge: swap.segId === 0 && !makerHasIntents };
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
