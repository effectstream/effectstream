// Maker-side Intent re-segmentation, against the real ledger — no network, no
// facade, no wallet.
//
// The fixtures build an offer the way `buildMakerOfferBlobLocal` does: the
// wallet facade's unshielded `initSwap` is
// `Intent.new(ttl)` + `guaranteedUnshieldedOffer`, then
// `Transaction.fromParts(net, undefined, undefined, intent)`. So "legacy" here
// is literally what the template published before this change, and "new" is
// that same transaction put through the shipped `randomizeIntentSegments`
// before `mockProve()` — the ordering the production path uses, minus the proof
// server.
//
// What that buys: the merge results below are the ledger's own verdict on real
// offer blobs, not a model of it.
import { describe, expect, test } from 'bun:test';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';
import type { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  INTENT_SEGMENT_MAX,
  INTENT_SEGMENT_MIN,
  randomIntentSegmentId,
  randomizeIntentSegments,
  randomizeRecipeIntentSegment,
} from './offerSegment';
import {
  batchPaysUnshielded,
  chooseLaceBalancing,
  decodeMakerOffers,
  mergeMakerOffers,
  pickSwapSegment,
} from './offerBatch';
import { parseTakerLegs } from './offerParse';
import { parseOfferSender, isOwnOffer } from './offerSender';

const L = ledger as any;
const NETWORK = 'undeployed' as NetworkId;
const ttl = () => new Date(Date.now() + 3600_000);

const TOKEN = 'cc'.repeat(32);
const OWNER = 'dd'.repeat(32);
const HASH = 'ee'.repeat(32);

const segments = (tx: any): number[] => (tx?.intents ? Array.from(tx.intents.keys()) : []);
const encode = (tx: any): string => OfferFiles.encode(tx.serialize());

/**
 * The UNPROVEN transaction the facade's `initSwap` hands back for an offer with
 * an unshielded leg — Intent at segment 1, every time.
 *
 * `direction: 'pays'` puts the value in an output: the maker pays it out, so the
 * TAKER pays for it. `'gets'` puts it in an input the maker spends, so the taker
 * receives it.
 */
const unprovenUnshielded = (direction: 'pays' | 'gets' = 'pays') => {
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
  return L.Transaction.fromParts(NETWORK, undefined, undefined, intent);
};

/** A published offer in the OLD format: Intent left at segment 1. */
const legacyOffer = (direction: 'pays' | 'gets' = 'pays') =>
  unprovenUnshielded(direction).mockProve();

/**
 * A published offer in the NEW format: the same transaction, re-segmented by the
 * shipped helper before proving — exactly the order `buildMakerOfferBlobLocal`
 * uses.
 */
const newOffer = (direction: 'pays' | 'gets' = 'pays', pick?: () => number) =>
  randomizeIntentSegments(unprovenUnshielded(direction), pick).tx.mockProve();

/** Shielded-only: no Intent anywhere, the branch that must stay untouched. */
const shieldedOffer = (value = 7n) => {
  const keys = L.ZswapSecretKeys.fromSeed(new Uint8Array(32).fill(3));
  const coin = L.createShieldedCoinInfo(TOKEN, value);
  const output = L.ZswapOutput.new(coin, undefined, keys.coinPublicKey, keys.encryptionPublicKey);
  return L.Transaction.fromParts(NETWORK, L.ZswapOffer.fromOutput(output)).mockProve();
};

describe('randomIntentSegmentId', () => {
  test('every draw is inside the documented range and never 0 or 1', () => {
    const draws = Array.from({ length: 5000 }, () => randomIntentSegmentId());
    expect(draws.every((n) => Number.isInteger(n))).toBe(true);
    expect(draws.every((n) => n >= INTENT_SEGMENT_MIN && n <= INTENT_SEGMENT_MAX)).toBe(true);
    // 0 is the guaranteed section, 1 is where fromParts and Lace both land — an
    // offer on either would be exactly as unmergeable as the ones this replaces.
    expect(draws.includes(0)).toBe(false);
    expect(draws.includes(1)).toBe(false);
  });

  test('the range is 2..65535 and the draw actually spreads across it', () => {
    expect(INTENT_SEGMENT_MIN).toBe(2);
    expect(INTENT_SEGMENT_MAX).toBe(65535);
    const draws = Array.from({ length: 5000 }, () => randomIntentSegmentId());
    // Uniform over 65,534 ids: both halves are hit, and 5000 draws collide only
    // rarely, so the id is not being clamped or bucketed somewhere narrow.
    expect(draws.some((n) => n < 32768)).toBe(true);
    expect(draws.some((n) => n >= 32768)).toBe(true);
    expect(new Set(draws).size).toBeGreaterThan(4500);
  });
});

describe('randomizeIntentSegments', () => {
  test('an unshielded-leg offer moves off segment 1', () => {
    const before = unprovenUnshielded();
    expect(segments(before)).toEqual([1]);

    const { tx, moves } = randomizeIntentSegments(before);
    expect(moves.length).toBe(1);
    expect(moves[0]!.from).toBe(1);
    expect(moves[0]!.to).toBeGreaterThanOrEqual(INTENT_SEGMENT_MIN);
    expect(moves[0]!.to).toBeLessThanOrEqual(INTENT_SEGMENT_MAX);
    expect(segments(tx)).toEqual([moves[0]!.to]);
  });

  test('the segment source is injectable, so the placement is exact', () => {
    const { tx, moves } = randomizeIntentSegments(unprovenUnshielded(), () => 4242);
    expect(moves).toEqual([{ from: 1, to: 4242 }]);
    expect(segments(tx)).toEqual([4242]);
  });

  test('a shielded-only offer is returned untouched, by identity', () => {
    // FR-002 structurally, not just behaviourally: there is no Intent, so no
    // code runs on this path at all.
    const before = L.Transaction.fromParts(NETWORK);
    const { tx, moves } = randomizeIntentSegments(before);
    expect(moves).toEqual([]);
    expect(tx).toBe(before);
  });

  test('the Intent survives the move intact — legs, value and owner all preserved', () => {
    const moved = randomizeIntentSegments(unprovenUnshielded('pays'), () => 777).tx;
    const intent = (moved.intents as Map<number, any>).get(777);
    const outputs = intent.guaranteedUnshieldedOffer.outputs;
    expect(outputs.length).toBe(1);
    expect(outputs[0].value).toBe(7n);
    expect(String(outputs[0].type)).toBe(TOKEN);
    // The imbalance the taker must cover is unchanged by the move.
    expect(Array.from((moved.mockProve().imbalances(0) as Map<any, bigint>).values())).toEqual([
      -7n,
    ]);
  });

  test('several Intents all move, to DISTINCT segments', () => {
    const two = unprovenUnshielded().addIntent(
      { tag: 'specific', value: 5 },
      (unprovenUnshielded('gets').intents as Map<number, any>).get(1),
    );
    expect(new Set(segments(two))).toEqual(new Set([1, 5]));

    const { tx, moves } = randomizeIntentSegments(two);
    expect(moves.length).toBe(2);
    expect(new Set(moves.map((m) => m.from))).toEqual(new Set([1, 5]));
    const to = moves.map((m) => m.to);
    expect(new Set(to).size).toBe(2);
    expect(new Set(segments(tx))).toEqual(new Set(to));
  });

  test('a colliding segment source is re-drawn rather than dropping an Intent', () => {
    // Forces the dedup loop: the first two draws are the same id.
    const queue = [900, 900, 901];
    const { tx, moves } = randomizeIntentSegments(
      unprovenUnshielded().addIntent(
        { tag: 'specific', value: 5 },
        (unprovenUnshielded('gets').intents as Map<number, any>).get(1),
      ),
      () => queue.shift() ?? 902,
    );
    expect(new Set(moves.map((m) => m.to))).toEqual(new Set([900, 901]));
    expect(segments(tx).length).toBe(2);
  });

  test('re-segmenting is impossible once the transaction is bound — the ordering is enforced by the ledger', () => {
    // The reason this lives at creation time and can never be a taker-side
    // repair: a published blob decodes to a bound transaction.
    const bound = unprovenUnshielded().mockProve();
    expect(() => randomizeIntentSegments(bound)).toThrow('already bound');
  });

  test('the signable payload is segment-dependent, which is why signing must come after', () => {
    const before = unprovenUnshielded('gets');
    const intent = (before.intents as Map<number, any>).get(1);
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    // A signature taken at segment 1 would not cover segment 4242, so the
    // node would reject the settlement with SIGNATURE_INVALID.
    expect(hex(intent.signatureData(1))).not.toBe(hex(intent.signatureData(4242)));
  });
});

describe('randomizeRecipeIntentSegment — the facade-recipe wrapper', () => {
  test('an unproven recipe comes back with the re-segmented transaction and its other fields', () => {
    const blockData = { some: 'value' };
    const recipe = {
      type: 'UNPROVEN_TRANSACTION',
      transaction: unprovenUnshielded(),
      blockData,
    };
    const out = randomizeRecipeIntentSegment(recipe, () => 3131);
    expect(out.skipped).toBeUndefined();
    expect(out.moves).toEqual([{ from: 1, to: 3131 }]);
    expect(out.recipe.type).toBe('UNPROVEN_TRANSACTION');
    expect(out.recipe.blockData).toBe(blockData);
    expect(segments(out.recipe.transaction)).toEqual([3131]);
  });

  test('a shielded-only recipe is the SAME object — creation is structurally unchanged', () => {
    const recipe = { type: 'UNPROVEN_TRANSACTION', transaction: L.Transaction.fromParts(NETWORK) };
    const out = randomizeRecipeIntentSegment(recipe);
    expect(out.recipe).toBe(recipe);
    expect(out.moves).toEqual([]);
    expect(out.skipped).toBeUndefined();
  });

  test('an unexpected recipe shape is passed through and flagged, never mangled', () => {
    const recipe = { type: 'FINALIZED_TRANSACTION', originalTransaction: {} } as any;
    const out = randomizeRecipeIntentSegment(recipe);
    expect(out.recipe).toBe(recipe);
    expect(out.skipped).toBe('not-an-unproven-recipe');
    expect(randomizeRecipeIntentSegment(undefined as any).skipped).toBe('not-an-unproven-recipe');
  });
});

// The point of the whole change: what a ladder can now contain.
describe('what merges, end to end through real offer blobs', () => {
  test('TWO new-format unshielded-leg offers MERGE — this is what used to be refused', () => {
    const blobs = [encode(newOffer()), encode(newOffer())];
    const merged = mergeMakerOffers(decodeMakerOffers(blobs, NETWORK));
    expect(segments(merged).length).toBe(2);
    expect(segments(merged)).not.toContain(1);
    // One balancing pass covers the ladder: two offers of 7 → the taker owes 14.
    expect(Array.from((merged.imbalances(0) as Map<any, bigint>).values())).toEqual([-14n]);
  });

  test('a new-format ladder round-trips through serialize/deserialize with both segments', () => {
    const merged = mergeMakerOffers(
      decodeMakerOffers([encode(newOffer()), encode(newOffer())], NETWORK),
    );
    const back = L.Transaction.deserialize('signature', 'proof', 'binding', merged.serialize());
    expect(new Set(segments(back))).toEqual(new Set(segments(merged)));
  });

  test('new × legacy merges — only one of them occupies segment 1', () => {
    const merged = mergeMakerOffers(
      decodeMakerOffers([encode(newOffer()), encode(legacyOffer())], NETWORK),
    );
    expect(segments(merged)).toContain(1);
    expect(segments(merged).length).toBe(2);
  });

  test('legacy × legacy is STILL refused before submission — the PR #910 guard stays', () => {
    const decoded = decodeMakerOffers([encode(legacyOffer()), encode(legacyOffer())], NETWORK);
    let err: any;
    try {
      mergeMakerOffers(decoded);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toContain("can't be settled together");
    expect(err.message).toContain('segment_id');
    expect(err.message).toContain('Nothing was submitted');
  });

  test('the 1-in-65534 case — two new offers that draw the SAME id — is caught by the same guard', () => {
    const a = randomizeIntentSegments(unprovenUnshielded(), () => 5150).tx.mockProve();
    const b = randomizeIntentSegments(unprovenUnshielded(), () => 5150).tx.mockProve();
    const decoded = decodeMakerOffers([encode(a), encode(b)], NETWORK);
    expect(() => mergeMakerOffers(decoded)).toThrow("can't be settled together");
  });

  test('new-format offers still merge with shielded-only ones', () => {
    const merged = mergeMakerOffers(
      decodeMakerOffers([encode(newOffer()), encode(shieldedOffer())], NETWORK),
    );
    expect(segments(merged).length).toBe(1);
  });

  test('N=1 new-format still passes through the settle pipeline untouched', () => {
    const decoded = decodeMakerOffers([encode(newOffer())], NETWORK);
    expect(mergeMakerOffers(decoded)).toBe(decoded[0]!.tx);
  });
});

// FR-004: everything that locates the Intent must work for any segment id.
describe('unmodified consumers still read a new-format blob', () => {
  test('the blob is a valid MIP-0005 offer and decodes to the randomized segment', () => {
    const tx = newOffer('pays', () => 20250);
    const blob = encode(tx);
    expect(blob.startsWith('swapoffer1')).toBe(true);
    const back = L.Transaction.deserialize(
      'signature',
      'proof',
      'binding',
      OfferFiles.decode(blob),
    );
    expect(segments(back)).toEqual([20250]);
  });

  test('parseTakerLegs reads the legs from any segment', () => {
    const pays = parseTakerLegs(encode(newOffer('pays')), NETWORK);
    expect(pays?.pays).toEqual([{ color: TOKEN, kind: 'unshielded', amount: 7n }]);
    const gets = parseTakerLegs(encode(newOffer('gets')), NETWORK);
    expect(gets?.gets).toEqual([{ color: TOKEN, kind: 'unshielded', amount: 7n }]);
    // Same answer as the legacy blob it replaces — the preview does not change.
    expect(parseTakerLegs(encode(legacyOffer('pays')), NETWORK)).toEqual(pays!);
  });

  test('batchPaysUnshielded still sees the unshielded leg', () => {
    expect(batchPaysUnshielded([encode(newOffer('pays'))], NETWORK)).toBe(true);
    expect(batchPaysUnshielded([encode(newOffer('gets'))], NETWORK)).toBe(false);
  });

  test('the maker is still identified, so “Yours” keeps working', () => {
    // parseOfferSender walks intents.values(), so the key it was stored under is
    // irrelevant — asserted rather than assumed.
    const info = parseOfferSender(encode(newOffer('gets')), NETWORK);
    expect(info?.unshieldedOwners).toContain(OWNER);
    expect(isOwnOffer(info, OWNER)).toBe(true);
  });

  test('Lace dispatch is unchanged: an unshielded-leg offer still routes to sealed-balance', () => {
    const legacy = chooseLaceBalancing(legacyOffer());
    const fresh = chooseLaceBalancing(newOffer());
    expect(fresh.useMirrorMerge).toBe(legacy.useMirrorMerge);
    expect(fresh.useMirrorMerge).toBe(false);
    expect(fresh.segId).toBe(0);
  });

  test('a merged new-format ladder still has exactly ONE swap segment', () => {
    // More than one would throw "Multi-segment offers are not supported" and
    // break the wallet dispatch — the randomized Intent slots carry no assets.
    const merged = mergeMakerOffers(
      decodeMakerOffers([encode(newOffer()), encode(newOffer())], NETWORK),
    );
    expect(pickSwapSegment(merged).segId).toBe(0);
  });
});
