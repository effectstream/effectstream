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
import {
  batchPaysUnshielded,
  chooseLaceBalancing,
  decodeMakerOffers,
  mergeMakerOffers,
  mergeMakerOffersToBytes,
  pickSwapSegment,
} from './offerBatch';

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

/** Deterministic shielded keys — a fixture recipient, nothing secret. */
const KEYS = L.ZswapSecretKeys.fromSeed(new Uint8Array(32).fill(3));

/**
 * A shielded-only offer that actually moves value: one output of TOKEN, so the
 * maker pays it out and the TAKER pays for it. Shielded value lives in the
 * transaction's guaranteed Zswap offer — segment 0, no Intent anywhere — which
 * is the shape a shielded↔shielded ladder has, and the shape Lace's
 * mirror+merge strategy exists for.
 */
const shieldedTx = (value = 7n) => {
  const coin = L.createShieldedCoinInfo(TOKEN, value);
  const output = L.ZswapOutput.new(coin, undefined, KEYS.coinPublicKey, KEYS.encryptionPublicKey);
  return L.Transaction.fromParts(NETWORK, L.ZswapOffer.fromOutput(output)).mockProve();
};

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
    expect(decoded.every((d) => d.raw.length > 0)).toBe(true);
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

// Lace takes bytes, not a ledger object, and picks a balancing strategy from
// the maker transaction's shape. Both are asserted here because there is no
// Lace wallet in this environment: what CAN be proved offline is that a merged
// ladder is handed the right bytes and still selects the strategy Lace has
// always been given.
describe('mergeMakerOffersToBytes — the Lace entry point', () => {
  test("N=1 hands the wallet the blob's OWN bytes, not a re-serialization", () => {
    const blob = encode(shieldedTx());
    const decoded = decodeMakerOffers([blob], NETWORK);
    const batch = mergeMakerOffersToBytes(decoded);
    // Identity, not equality: a single take must reach the wallet through the
    // same object and the same bytes it did before batching existed.
    expect(batch.tx).toBe(decoded[0]!.tx);
    expect(batch.bytes).toBe(decoded[0]!.raw);
    expect(batch.bytes).toEqual(OfferFiles.decode(blob));
  });

  test('N offers are folded into one transaction and serialized once', () => {
    const blobs = [encode(shieldedTx()), encode(shieldedTx()), encode(shieldedTx())];
    const decoded = decodeMakerOffers(blobs, NETWORK);
    const batch = mergeMakerOffersToBytes(decoded);
    // The bytes are the ladder's, not any single offer's.
    for (const d of decoded) expect(batch.bytes).not.toEqual(d.raw);
    const back = L.Transaction.deserialize('signature', 'proof', 'binding', batch.bytes);
    // Three offers of 7 → the wallet is asked for 21 in ONE balancing pass.
    expect(Array.from((back.imbalances(0) as Map<any, bigint>).values())).toEqual([-21n]);
    expect(segments(back)).toEqual([]);
  });

  test('a batch that cannot compose yields NO bytes — nothing reaches the wallet', () => {
    const decoded = decodeMakerOffers(
      [encode(unshieldedTx('pays')), encode(unshieldedTx('pays'))],
      NETWORK,
    );
    expect(() => mergeMakerOffersToBytes(decoded)).toThrow("can't be settled together");
  });
});

describe('chooseLaceBalancing — a merged ladder keeps Lace’s strategy', () => {
  test('one shielded offer → mirror+merge at segment 0 (today’s behaviour)', () => {
    const choice = chooseLaceBalancing(shieldedTx());
    expect(choice.useMirrorMerge).toBe(true);
    expect(choice.segId).toBe(0);
  });

  test('a MERGED shielded ladder is the same shape, and the mirror covers the SUM', () => {
    const blobs = [encode(shieldedTx()), encode(shieldedTx())];
    const merged = mergeMakerOffers(decodeMakerOffers(blobs, NETWORK));
    // Both legs of the dispatch predicate, checked explicitly: still segment 0,
    // and still no Intent for Lace's taker-side makeIntent to collide with.
    expect(segments(merged)).toEqual([]);
    const choice = chooseLaceBalancing(merged);
    expect(choice.useMirrorMerge).toBe(true);
    expect(choice.segId).toBe(0);
    // What Lace is asked to mirror is the ladder's total, so one taker side
    // settles both offers.
    const deltas = Array.from(choice.imbalances.entries()).map(([tt, v]) => [
      (tt as any).tag,
      v,
    ]);
    expect(deltas).toEqual([['shielded', -14n]]);
  });

  test('pickSwapSegment agrees, and a ladder still has exactly ONE swap segment', () => {
    const merged = mergeMakerOffers(
      decodeMakerOffers([encode(shieldedTx()), encode(shieldedTx(5n))], NETWORK),
    );
    // More than one segment carrying assets would throw "Multi-segment offers
    // are not supported" — merging must not produce that.
    expect(pickSwapSegment(merged).segId).toBe(0);
  });

  test('an unshielded-leg offer still routes to sealed-balance', () => {
    // Regression: the empty structural Intent[1] keeps mirror+merge off, exactly
    // as before batching. A single unshielded offer is unaffected by the merge.
    const choice = chooseLaceBalancing(unshieldedTx('pays'));
    expect(choice.useMirrorMerge).toBe(false);
    expect(choice.segId).toBe(0);
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
