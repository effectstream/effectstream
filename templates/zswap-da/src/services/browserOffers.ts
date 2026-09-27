// Browser-wallet settlement for one or more MIP-0005 offers.
//
// This module contains only the offer path. Test-token minting is provided by
// the external Faucet service and does not require a local Compact contract.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  Transaction as LedgerV8Transaction,
} from '@midnight-ntwrk/ledger-v8';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { parseCoinPublicKeyToHex } from '@midnight-ntwrk/midnight-js-utils';
import { submitToBatcher, type MidnightRuntimeConfig } from './api';
import {
  chooseBrowserWalletBalancing,
  decodeMakerOffers,
  mergeMakerOffersToBytes,
} from './offerBatch';
import { dlog, timed } from '../debug';

const toHex = (data: Uint8Array): string =>
  Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};


/**
 * Shielded-only path: maker tx has no Intent slots and asset deltas live in
 * segment 0's guaranteed Zswap offer. `balanceSealedTransaction` can't be
 * used here — it walks `tx.intents` and throws "No segments found in the
 * provided transaction" when the map is empty. Mirror the taker side via
 * `makeIntent` and merge: segment-0 offers compose because they aren't
 * keyed Intents.
 *
 * Unshielded offers are dispatched away from this function in
 * `proveAndSubmitOffers` because the connector behavior observed in the
 * affected implementation adds an empty structural Intent[1] to *both* maker
 * and taker unshielded txs, which collides on merge with
 * "key (segment_id) collision during intents merge: 1".
 */
async function balanceShieldedViaMirrorMerge(
  connectedApi: ConnectedAPI,
  makerTx: any,
  swap: { segId: number; imbalances: Map<any, bigint> },
): Promise<{ balancedHex: string; txHash: string }> {
  dlog('mirror+merge: enter', { segId: swap.segId });
  const { shieldedAddress } = await timed('mirror+merge: wallet.getShieldedAddresses()', () =>
    connectedApi.getShieldedAddresses(),
  );
  const { unshieldedAddress } = await timed('mirror+merge: wallet.getUnshieldedAddress()', () =>
    connectedApi.getUnshieldedAddress(),
  );
  dlog('mirror+merge: taker addresses', {
    shieldedAddress: `${shieldedAddress.slice(0, 20)}…`,
    unshieldedAddress: `${unshieldedAddress.slice(0, 20)}…`,
  });

  type DesiredInput = { kind: 'shielded' | 'unshielded'; type: string; value: bigint };
  type DesiredOutput = DesiredInput & { recipient: string };
  const takerInputs: DesiredInput[] = [];
  const takerOutputs: DesiredOutput[] = [];

  // +N for token T → maker spent N, taker should receive N (taker output).
  // -N for token T → maker outputs N, taker should provide N (taker input).
  for (const [tt, delta] of swap.imbalances) {
    const tag = (tt as any).tag as 'shielded' | 'unshielded' | 'dust';
    if (tag === 'dust') continue; // batcher pays
    if (tag !== 'shielded' && tag !== 'unshielded') continue;
    const type = (tt as any).raw as string;
    if (delta > 0n) {
      takerOutputs.push({
        kind: tag,
        type,
        value: delta,
        recipient: tag === 'shielded' ? shieldedAddress : unshieldedAddress,
      });
    } else if (delta < 0n) {
      takerInputs.push({ kind: tag, type, value: -delta });
    }
  }

  const makerIntentIds: number[] = makerTx.intents
    ? Array.from(makerTx.intents.keys() as Iterable<number>)
    : [];

  // Shielded `makeIntent` doesn't populate an Intent slot, so the requested
  // id is moot — the resulting taker tx will have intents.size === 0
  // regardless. Pass a non-1 value defensively in case a connector changes
  // shielded `makeIntent` to add a structural Intent[1].
  const requestedTakerIntentId: number | 'random' = 1000;

  console.log('[browserOffers] complete (mirror+merge): taker mirror', {
    segId: swap.segId,
    makerIntentIds,
    requestedTakerIntentId,
    inputs: takerInputs.map(i => ({ ...i, value: i.value.toString() })),
    outputs: takerOutputs.map(o => ({ ...o, value: o.value.toString() })),
  });

  // ⬇ THE reported hang lands here: this is a call into the browser wallet to
  // build the taker's intent. If it never resolves you'll see the
  // `▶ wallet.makeIntent` line below with no matching `✓` — the connector is
  // stuck (pending popup, coin selection, or indexer sync), NOT the backend.
  dlog('mirror+merge: → calling wallet.makeIntent', {
    takerInputs: takerInputs.map((i) => ({ ...i, value: i.value.toString() })),
    takerOutputs: takerOutputs.map((o) => ({ ...o, value: o.value.toString() })),
    intentId: requestedTakerIntentId,
    payFees: false,
  });
  const { tx: takerTxHex } = await timed(
    'mirror+merge: wallet.makeIntent(taker inputs/outputs) ← COMMON HANG POINT',
    () =>
      connectedApi.makeIntent(takerInputs, takerOutputs, {
        intentId: requestedTakerIntentId,
        payFees: false,
      }),
  );
  console.log('[browserOffers] complete (mirror+merge): taker tx hex bytes', takerTxHex.length / 2);

  const takerTx = LedgerV8Transaction.deserialize(
    'signature',
    'proof',
    'binding',
    fromHex(takerTxHex),
  );

  // Full taker tx shape (mirror of the maker tx segment log earlier in
  // proveAndSubmitOffers). Tells us which segIds the connector actually populated and
  // what's in each segment — enough to diagnose any "intents merge: N"
  // collision or zswap-offer composition error.
  const takerIntentIds: number[] = takerTx.intents
    ? Array.from(takerTx.intents.keys() as Iterable<number>)
    : [];
  const takerFallibleIds: number[] = takerTx.fallibleOffer
    ? Array.from(takerTx.fallibleOffer.keys() as Iterable<number>)
    : [];
  console.log('[browserOffers] complete (mirror+merge): taker tx shape', {
    requestedTakerIntentId,
    actualTakerIntentIds: takerIntentIds,
    actualTakerFallibleIds: takerFallibleIds,
    segmentImbalances: Object.fromEntries(
      Array.from(new Set<number>([0, ...takerIntentIds, ...takerFallibleIds])).map((segId) => {
        try {
          const imb = takerTx.imbalances(segId) as Map<any, bigint>;
          return [
            segId,
            Array.from(imb.entries()).map(([tt, v]) => ({
              tag: (tt as any).tag,
              raw: (tt as any).raw,
              delta: v.toString(),
            })),
          ];
        } catch {
          return [segId, 'imbalances() threw'];
        }
      }),
    ),
  });

  // Sanity check: under the shielded-only dispatch, neither maker nor taker
  // should have any Intent slots, so `overlapping` is expected to be empty.
  // A non-empty list here means the dispatch in `proveAndSubmitOffers` is
  // mis-routing an offer that has Intents into mirror+merge.
  const overlap = makerIntentIds.filter((id) => takerIntentIds.includes(id));
  console.log('[browserOffers] complete (mirror+merge): about to merge', {
    makerIntentIds,
    takerIntentIds,
    overlapping: overlap,
    expectsCollision: overlap.length > 0,
  });

  dlog('mirror+merge: → makerTx.merge(takerTx) (ledger, sync)');
  const merged = makerTx.merge(takerTx);
  dlog('mirror+merge: ✓ merged (ledger)');
  const balancedHex = toHex(merged.serialize());
  const txHash = (merged as any).transactionHash?.() ?? '';
  const mergedIntentIds: number[] = (merged as any).intents
    ? Array.from((merged as any).intents.keys() as Iterable<number>)
    : [];
  console.log('[browserOffers] complete (mirror+merge): merged maker + taker', {
    bytes: balancedHex.length / 2,
    txHash,
    mergedIntentIds,
  });
  return { balancedHex, txHash };
}

/**
 * Sealed-balance path: maker tx has at least one Intent slot. Hand the
 * sealed tx to the browser wallet's
 * `balanceSealedTransaction(payFees: false)`; the connector adds the
 * counterparty side and the batcher pays fees in DUST.
 *
 * Reached for unshielded4unshielded (segment-0 deltas + empty Intent[1])
 * and any future numbered-Intent offers. Mirror+merge can't be used here
 * because the observed connector's unshielded `makeIntent` would put a
 * colliding Intent[1] on the taker side; sealed-balance has no such issue
 * because it doesn't go through `makeIntent` on the taker side.
 */
async function balanceMixedViaSealedBalance(
  connectedApi: ConnectedAPI,
  makerTxHex: string,
): Promise<{ balancedHex: string; txHash: string }> {
  dlog('sealed balance: → calling wallet.balanceSealedTransaction', {
    makerTxBytes: makerTxHex.length / 2,
    payFees: false,
  });
  const { tx: balancedHex } = await timed(
    'sealed balance: wallet.balanceSealedTransaction(payFees:false) ← possible hang point',
    () => connectedApi.balanceSealedTransaction(makerTxHex, { payFees: false }),
  );
  let txHash = '';
  try {
    const balancedTx = LedgerV8Transaction.deserialize(
      'signature',
      'proof',
      'binding',
      fromHex(balancedHex),
    );
    txHash = (balancedTx as any).transactionHash?.() ?? '';
  } catch {
    // Hash is best-effort for logging; missing it shouldn't block submission.
  }
  console.log('[browserOffers] complete (sealed balance): returned', {
    bytes: balancedHex.length / 2,
    txHash,
  });
  return { balancedHex, txHash };
}

/**
 * Complete one or more makers' bech32m offer blobs as the connected browser
 * wallet, in a SINGLE transaction.
 *
 * The N maker halves are decoded and folded together first (see
 * services/offerBatch.ts), and the wallet then balances the merged result once.
 * Settling a ladder offer-by-offer re-spent the taker's only coin — nothing
 * told the wallet about take #k's spend before take #k+1 was balanced, and the
 * node rejected everything after the first with
 * `Zswap(NullifierAlreadyPresent)`. One balancing pass, one submission, no
 * window.
 *
 * A merged shielded↔shielded ladder is the same SHAPE as one shielded offer as
 * far as this function's dispatch is concerned — no Intents, deltas summed in
 * segment 0 — so it takes the same mirror+merge route, and the mirrored taker
 * side covers the ladder's totals. `offerBatch.test.ts` asserts that against
 * the real ledger. Offers that cannot compose (two unshielded legs both at
 * segment 1) are refused by `mergeMakerOffersToBytes` before anything is sent.
 *
 * N=1 is byte-for-byte the old single-offer path: the wallet is handed the
 * blob's own decoded bytes, not a re-serialization of them.
 *
 * Two balancing strategies, dispatched on the merged maker tx's shape:
 *   - segment-0 deltas, no Intent slots (shielded-only) → mirror+merge
 *   - any Intent slot present (unshielded or numbered)  → balanceSealedTransaction
 *
 * Neither strategy works for both cases:
 *   - `balanceSealedTransaction` throws "No segments found in the provided
 *     transaction" on shielded-only offers (it walks `tx.intents`, which is
 *     empty there).
 *   - mirror+merge collides with "key (segment_id) collision during intents
 *     merge: 1" on unshielded offers in the affected connector implementation,
 *     whose `makeIntent` lands its Intent at segId 1, so maker and taker would
 *     both carry it.
 */
export async function proveAndSubmitOffers(
  connectedApi: ConnectedAPI,
  config: MidnightRuntimeConfig,
  offerBech32ms: string[],
): Promise<{ txHash: string }> {
  dlog('proveAndSubmitOffers: enter', {
    networkId: config.networkId,
    proofServerUri: config.proofServerUri,
    offers: offerBech32ms.length,
    offerLens: offerBech32ms.map((b) => b.length),
  });
  setNetworkId(config.networkId as NetworkId);

  console.log('[browserOffers] complete: decoding offer bytes');
  dlog('proveAndSubmitOffers: → decode + merge maker txs (sync)');
  const decoded = decodeMakerOffers(offerBech32ms, config.networkId as NetworkId);
  const { tx: makerTx, bytes: makerBytes } = mergeMakerOffersToBytes(decoded);
  dlog('proveAndSubmitOffers: ✓ maker txs deserialized + merged', {
    offers: decoded.length,
    bytes: decoded.map((d) => d.raw.length),
    mergedBytes: makerBytes.length,
  });

  // Diagnostic: full segment shape of the (merged) maker tx. Drives the
  // dispatch decision below (Intent slot present? → sealed balance; else →
  // mirror+merge) and gives fast triage on any balance/merge error.
  const intentIds: number[] = makerTx.intents
    ? (Array.from(makerTx.intents.keys()) as number[])
    : [];
  const fallibleIds: number[] = makerTx.fallibleOffer
    ? (Array.from(makerTx.fallibleOffer.keys()) as number[])
    : [];
  console.log('[browserOffers] complete: maker tx segments', {
    offers: decoded.length,
    intentIds,
    fallibleIds,
    segmentImbalances: Object.fromEntries(
      Array.from(new Set<number>([0, ...intentIds, ...fallibleIds])).map((segId) => {
        try {
          const imb = makerTx.imbalances(segId) as Map<any, bigint>;
          return [
            segId,
            Array.from(imb.entries()).map(([tt, v]) => ({
              tag: (tt as any).tag,
              raw: (tt as any).raw,
              delta: v.toString(),
            })),
          ];
        } catch {
          return [segId, 'imbalances() threw'];
        }
      }),
    ),
  });

  const { useMirrorMerge, ...swap } = chooseBrowserWalletBalancing(makerTx);
  const strategy = useMirrorMerge
    ? 'mirror+merge (segment 0 / guaranteed offer)'
    : 'balanceSealedTransaction (numbered Intent)';
  console.log('[browserOffers] complete: chose strategy', {
    segId: swap.segId,
    strategy,
  });

  let balancedHex: string;
  let txHash: string;
  try {
    if (useMirrorMerge) {
      ({ balancedHex, txHash } = await timed('balance via mirror+merge', () =>
        balanceShieldedViaMirrorMerge(connectedApi, makerTx, swap),
      ));
    } else {
      ({ balancedHex, txHash } = await timed('balance via sealed-balance', () =>
        balanceMixedViaSealedBalance(connectedApi, toHex(makerBytes)),
      ));
    }
    dlog('proveAndSubmitOffers: ✓ balanced', { strategy, balancedBytes: balancedHex.length / 2, txHash });
  } catch (e: any) {
    console.error('[browserOffers] complete: balancing failed', {
      strategy,
      offers: decoded.length,
      name: e?.name,
      message: e?.message,
      raw: e,
    });
    throw new Error(
      `Wallet failed to balance the maker offer: ${e?.message ?? e?.name ?? 'unknown'}`,
      { cause: e },
    );
  }

  const coinPublicKeyHex = parseCoinPublicKeyToHex(
    (await timed('proveAndSubmitOffers: wallet.getShieldedAddresses() (for batcher addr)', () =>
      connectedApi.getShieldedAddresses(),
    )).shieldedCoinPublicKey,
    config.networkId as NetworkId,
  );

  console.log('[browserOffers] complete: submitting to batcher', {
    txHash,
    offers: decoded.length,
  });
  try {
    await timed('proveAndSubmitOffers: submitToBatcher (one submission for the whole batch)', () =>
      submitToBatcher(balancedHex, 'finalized', coinPublicKeyHex),
    );
  } catch (e: any) {
    console.error('[browserOffers] complete: batcher submit failed', {
      message: e?.message,
      raw: e,
    });
    throw new Error(
      `Batcher submit failed: ${e?.message ?? JSON.stringify(e) ?? 'unknown'}`,
      { cause: e },
    );
  }

  console.log('[browserOffers] complete: done', { txHash, offers: decoded.length });
  return { txHash };
}

/**
 * Single-offer take — the degenerate N=1 of {@link proveAndSubmitOffers}, so
 * both paths decode, balance and submit through exactly the same code.
 */
export function proveAndSubmitOffer(
  connectedApi: ConnectedAPI,
  config: MidnightRuntimeConfig,
  offerBech32m: string,
): Promise<{ txHash: string }> {
  return proveAndSubmitOffers(connectedApi, config, [offerBech32m]);
}
