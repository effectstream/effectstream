// Batch-settlement helpers, against the real ledger — no network, no facade.
//
// Fixtures are genuine `swapoffer1…` blobs: a ledger transaction built from
// parts, `mockProve()`d (real proving needs a proof server; mock proving
// produces the same 'signature'/'proof'/'binding' shape the settle path
// deserializes) and MIP-0005 encoded. So `decodeMakerOffers` and
// `mergeMakerOffers` are exercised against actual ledger behaviour, including
// the segment-collision rule that bounds what a ladder can contain.
import { describe, expect, test } from 'bun:test';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';
import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { batchPaysUnshielded, decodeMakerOffers, mergeMakerOffers } from './offerBatch';

const L = ledger as any;
const NETWORK = 'undeployed' as NetworkId;
const ttl = () => new Date(Date.now() + 3600_000);

const TOKEN = 'cc'.repeat(32);
const OWNER = 'dd'.repeat(32);
const HASH = 'ee'.repeat(32);

const segments = (tx: any): number[] => (tx?.intents ? Array.from(tx.intents.keys()) : []);
const encode = (tx: any): string => OfferFiles.encode(tx.serialize());

/**
 * A shielded-only offer carries no Intent at all, so any number of them
 * compose. This is the shape a shielded↔shielded ladder has.
 */
const intentFreeTx = () => L.Transaction.fromParts(NETWORK).mockProve();

/**
 * An offer with an unshielded leg. `fromParts` is what the wallet facade uses,
 * and it always lands the Intent at segment 1 — which is exactly why two such
 * offers cannot be batched. `randomize` uses the ledger's own
 * `fromPartsRandomized` (documented as existing "to better allow merging") to
 * produce the mergeable counterexample.
 *
 * `direction: 'pays'` puts the value in an output — the maker pays it out, so
 * the TAKER pays. `'gets'` puts it in an input — the maker spends it, so the
 * taker receives.
 */
const unshieldedTx = (direction: 'pays' | 'gets', randomize = false) => {
  const offer =
    direction === 'gets'
      ? L.UnshieldedOffer.new(
          [{ value: 7n, owner: OWNER, type: TOKEN, intentHash: HASH, outputNo: 0 }],
          [],
          [],
        )
      : L.UnshieldedOffer.new([], [{ value: 7n, owner: OWNER, type: TOKEN }], []);
  const intent = L.Intent.new(ttl());
  intent.guaranteedUnshieldedOffer = offer;
  return L.Transaction[randomize ? 'fromPartsRandomized' : 'fromParts'](
    NETWORK,
    undefined,
    undefined,
    intent,
  ).mockProve();
};

describe('decodeMakerOffers', () => {
  test('decodes every blob in the batch', () => {
    const blobs = [encode(intentFreeTx()), encode(intentFreeTx()), encode(intentFreeTx())];
    const decoded = decodeMakerOffers(blobs, NETWORK);
    expect(decoded.length).toBe(3);
    expect(decoded.map((d) => d.blob)).toEqual(blobs);
    expect(decoded.every((d) => d.bytes > 0)).toBe(true);
    expect(decoded.every((d) => typeof d.tx?.merge === 'function')).toBe(true);
  });

  test('an empty batch is rejected', () => {
    expect(() => decodeMakerOffers([], NETWORK)).toThrow('No offers to settle.');
  });

  test('ONE bad blob rejects the WHOLE batch, naming the offer', () => {
    const blobs = [encode(intentFreeTx()), 'swapoffer1notarealblob', encode(intentFreeTx())];
    let err: any;
    try {
      decodeMakerOffers(blobs, NETWORK);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toContain('Offer 2 of 3');
    // Atomic: the user must be told nothing went out, not left guessing which
    // half of the ladder they now own.
    expect(err.message).toContain('Nothing was submitted');
    expect(err.cause).toBeDefined();
  });

  test('a single bad blob reports without batch wording', () => {
    let err: any;
    try {
      decodeMakerOffers(['definitely-not-an-offer'], NETWORK);
    } catch (e) {
      err = e;
    }
    expect(err.message).toContain('This offer could not be read');
    expect(err.message).not.toContain('of 1');
  });
});

describe('mergeMakerOffers', () => {
  test('N=1 is the degenerate case — the decoded tx passes through untouched', () => {
    const decoded = decodeMakerOffers([encode(intentFreeTx())], NETWORK);
    expect(mergeMakerOffers(decoded)).toBe(decoded[0]!.tx);
  });

  test('N shielded-only offers merge, and the merged tx round-trips', () => {
    const blobs = [encode(intentFreeTx()), encode(intentFreeTx()), encode(intentFreeTx())];
    const merged = mergeMakerOffers(decodeMakerOffers(blobs, NETWORK));
    const bytes = merged.serialize();
    const back = L.Transaction.deserialize('signature', 'proof', 'binding', bytes);
    expect(bytes.length).toBeGreaterThan(0);
    expect(segments(back)).toEqual([]);
  });

  test('merging sums the imbalances, so ONE balancing pass covers the ladder', () => {
    const blobs = [encode(unshieldedTx('pays', true)), encode(unshieldedTx('pays', true))];
    const merged = mergeMakerOffers(decodeMakerOffers(blobs, NETWORK));
    const imbalance = merged.imbalances(0) as Map<any, bigint>;
    // Each offer has the maker paying out 7 of TOKEN; the merged transaction
    // owes 14, which is what the taker's single balancing side must cover.
    expect(Array.from(imbalance.values())).toEqual([-14n]);
    expect(segments(merged).length).toBe(2);
  });

  test('offers on distinct segments merge and keep both', () => {
    const a = unshieldedTx('pays', true);
    const b = unshieldedTx('pays', true);
    const merged = mergeMakerOffers(decodeMakerOffers([encode(a), encode(b)], NETWORK));
    expect(new Set(segments(merged))).toEqual(new Set([...segments(a), ...segments(b)]));
  });

  test('two offers with an unshielded leg collide at segment 1 and are refused BEFORE submission', () => {
    const blobs = [encode(unshieldedTx('pays')), encode(unshieldedTx('pays'))];
    const decoded = decodeMakerOffers(blobs, NETWORK);
    let err: any;
    try {
      mergeMakerOffers(decoded);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toContain("can't be settled together");
    expect(err.message).toContain('one at a time');
    expect(err.message).toContain('Nothing was submitted');
    // The ledger's own wording is kept so the cause is diagnosable.
    expect(err.message).toContain('segment_id');
    expect(err.cause).toBeDefined();
  });

  test('an empty batch is rejected', () => {
    expect(() => mergeMakerOffers([])).toThrow('No offers to settle.');
  });
});

describe('batchPaysUnshielded', () => {
  test('true when the taker pays an unshielded leg in the only offer', () => {
    expect(batchPaysUnshielded([encode(unshieldedTx('pays'))], NETWORK)).toBe(true);
  });

  test('true when ANY offer in the batch has an unshielded taker leg', () => {
    const blobs = [encode(unshieldedTx('gets', true)), encode(unshieldedTx('pays', true))];
    expect(batchPaysUnshielded(blobs, NETWORK)).toBe(true);
  });

  test('false when no offer in the batch has the taker paying unshielded', () => {
    const blobs = [encode(unshieldedTx('gets', true)), encode(unshieldedTx('gets', true))];
    expect(batchPaysUnshielded(blobs, NETWORK)).toBe(false);
  });

  test('an unreadable leg set counts as unshielded — an unsigned settlement is only caught by the node', () => {
    expect(batchPaysUnshielded([encode(intentFreeTx())], NETWORK)).toBe(true);
    expect(batchPaysUnshielded(['not-an-offer'], NETWORK)).toBe(true);
  });

  test('an empty batch pays nothing', () => {
    expect(batchPaysUnshielded([], NETWORK)).toBe(false);
  });
});
