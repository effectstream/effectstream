// Browser-side Midnight contract client for the OfferFiles contract.
// Modeled on e2e-v2/wallets-ui/client/src/contracts/counter.ts — the same
// provider stack, with OfferFilesContract in place of Counter and the demo's
// three circuits (mint_shielded, mint_unshielded, incrementNoun) exposed.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  findDeployedContract,
  type FoundContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import {
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
  Transaction as LedgerV8Transaction,
  type TransactionId,
} from '@midnight-ntwrk/ledger-v8';
import {
  type MidnightProvider,
  type MidnightProviders,
  type UnboundTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type NetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
} from '@midnight-ntwrk/midnight-js-utils';

import { OfferFilesContract, witnesses } from '@zswap-da/contract-offer-files';
import { decodeOffer } from 'mip-zswap-offer';
import { submitToBatcher } from './api';

export interface MidnightBrowserConfig {
  contractAddress: string;
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  networkId: string;
}

export type OfferFilesCircuits = 'mint_shielded' | 'mint_unshielded' | 'incrementNoun';
export const OFFER_FILES_PRIVATE_STATE_ID = 'offerFilesPrivateState';
export type OfferFilesProviders = MidnightProviders<
  OfferFilesCircuits,
  typeof OFFER_FILES_PRIVATE_STATE_ID,
  {}
>;
export type FoundOfferFilesContract = FoundContract<OfferFilesContract.Contract>;

export interface ConnectedOfferFilesContract {
  readonly contract: FoundOfferFilesContract;
  readonly providers: OfferFilesProviders;
  readonly compiledContract: any;
  readonly config: MidnightBrowserConfig;
}

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

function createWalletAndMidnightProvider(
  connectedApi: ConnectedAPI,
  coinPublicKey: CoinPublicKey,
  encryptionPublicKey: EncPublicKey,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return encryptionPublicKey;
    },
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
      // payFees:false → wallet seals the tx without adding its own Dust.
      // The batcher balances + submits, so the browser wallet pays no fees.
      console.log('[browserContract] balanceTx: asking wallet to seal (payFees:false)');
      const serialized = toHex(tx.serialize());
      try {
        const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(
          serialized,
          { payFees: false },
        );
        return LedgerV8Transaction.deserialize(
          'signature',
          'proof',
          'binding',
          fromHex(balancedHex),
        ) as FinalizedTransaction;
      } catch (e: any) {
        console.error('[browserContract] balanceTx: wallet rejected', {
          name: e?.name,
          message: e?.message,
          raw: e,
        });
        throw new Error(
          `balanceUnsealedTransaction failed: ${e?.message ?? e?.name ?? JSON.stringify(e) ?? 'unknown'}`,
          { cause: e },
        );
      }
    },
    async submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      const serializedHex = toHex(tx.serialize());
      // midnight-js polls the indexer by `identifier`, not by tx hash
      // (TX_ID_QUERY uses `offset: { identifier }`). Compute the identifier
      // from the finalized tx itself — the batcher only returns a hash, which
      // would never match and cause watchForTxData to hang.
      const identifiers = (tx as any).identifiers?.() as string[] | undefined;
      const localHash = (tx as any).transactionHash?.() as string | undefined;
      console.log('[browserContract] submitTx: routing to batcher', {
        localHash,
        identifiers,
      });
      try {
        await submitToBatcher(serializedHex, 'finalized', coinPublicKey as unknown as string);
        const identifier = identifiers?.[0];
        if (!identifier) {
          throw new Error('ledger tx returned no identifiers — cannot track finalization');
        }
        return identifier as TransactionId;
      } catch (e: any) {
        console.error('[browserContract] submitTx: batcher submit failed', {
          message: e?.message,
          raw: e,
        });
        throw new Error(
          `batcher submit failed: ${e?.message ?? JSON.stringify(e) ?? 'unknown'}`,
          { cause: e },
        );
      }
    },
  };
}

async function buildProviders(
  connectedApi: ConnectedAPI,
  config: MidnightBrowserConfig,
): Promise<OfferFilesProviders> {
  const [shieldedAddresses] = await Promise.all([connectedApi.getShieldedAddresses()]);

  // Lace returns shielded keys in bech32m form, but ledger-v8's CoinPublicKey /
  // EncPublicKey are documented as "hex-encoded 35-byte string". Passing
  // bech32m straight through means mint_shielded creates a zswap output whose
  // recipient bytes are the bech32m string interpreted as hex — i.e. addressed
  // to a key nobody holds, so the wallet never finds the coin. Normalize here.
  const coinPublicKeyHex = parseCoinPublicKeyToHex(
    shieldedAddresses.shieldedCoinPublicKey,
    config.networkId as NetworkId,
  );
  const encPublicKeyHex = parseEncPublicKeyToHex(
    shieldedAddresses.shieldedEncryptionPublicKey,
    config.networkId as NetworkId,
  );

  // Diagnostic dump — the coin public key here is the recipient that will be
  // baked into the mint output's coin commitment AND the encryption ciphertext
  // is keyed off encPublicKeyHex. If either of these doesn't match what Lace
  // actually scans for, the wallet will never claim the mint.
  console.log('[browserContract] keys for mint output recipient + ciphertext', {
    networkId: config.networkId,
    raw: {
      shieldedAddress: shieldedAddresses.shieldedAddress,
      shieldedCoinPublicKey: shieldedAddresses.shieldedCoinPublicKey,
      shieldedEncryptionPublicKey: shieldedAddresses.shieldedEncryptionPublicKey,
    },
    parsed: {
      coinPublicKeyHex,
      coinPublicKeyHexLen: coinPublicKeyHex.length,
      encPublicKeyHex,
      encPublicKeyHexLen: encPublicKeyHex.length,
    },
  });

  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    connectedApi,
    coinPublicKeyHex as unknown as CoinPublicKey,
    encPublicKeyHex as unknown as EncPublicKey,
  );

  // Dev-server hazard: when FetchZkConfigProvider asks for a circuit we don't
  // serve (e.g. zswap primitives like `output` / `input` / `spend`), Vite's
  // SPA fallback returns 200 + index.html instead of 404. The provider only
  // checks `response.ok`, so HTML bytes would silently masquerade as the ZK
  // key and the proof server rejects the resulting payload with a 400.
  //
  // Fix: force no-store (so stale 304s never substitute for the real body),
  // and synthesize a 404 for any response whose Content-Type starts with
  // text/html. Missing-key lookups then throw inside sendRequest →
  // getKeyMaterial catches and returns undefined → the proof server falls
  // back to its own bundled keys for the built-in circuits.
  const safeFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input as any, { ...(init ?? {}), cache: 'no-store' });
    const contentType = res.headers.get('content-type') ?? '';
    if (res.ok && contentType.toLowerCase().startsWith('text/html')) {
      return new Response(null, { status: 404, statusText: 'Not Found (HTML fallback)' });
    }
    return res;
  };
  const zkConfigProvider = new FetchZkConfigProvider<OfferFilesCircuits>(
    window.location.origin,
    safeFetch.bind(window),
  );

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: async () => 'ZSWAP_DA_STORAGE_PASSWORD_16+',
      // Account-scope storage to the connected wallet so switching wallets
      // doesn't leak or collide private state across accounts. Use the hex
      // form so the storage key matches the canonical CoinPublicKey shape
      // and stays stable across any Lace bech32-prefix changes.
      accountId: coinPublicKeyHex,
    } as any),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  } as OfferFilesProviders;
}

export async function connectBrowserContract(
  connectedApi: ConnectedAPI,
  config: MidnightBrowserConfig,
): Promise<ConnectedOfferFilesContract> {
  // midnight-js reads a module-global network id; must be set before any
  // wallet/contract/serialization call or the ledger throws.
  console.log(`[browserContract] setNetworkId("${config.networkId}")`);
  setNetworkId(config.networkId as any);

  console.log('[browserContract] connect: building providers…');
  const providers = await buildProviders(connectedApi, config);

  console.log('[browserContract] connect: compiling OfferFilesContract client…');
  const compiledContract = CompiledContract.make(
    'contract-offer-files',
    OfferFilesContract.Contract as any,
  ).pipe(
    CompiledContract.withWitnesses(witnesses as unknown as never),
    // Browser fetches ZK assets via FetchZkConfigProvider; this path is a
    // placeholder satisfying the API (counter.ts uses './' the same way).
    CompiledContract.withCompiledFileAssets('./'),
  );

  console.log(`[browserContract] connect: findDeployedContract ${config.contractAddress}`);
  const contract = (await findDeployedContract(providers, {
    contractAddress: config.contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: OFFER_FILES_PRIVATE_STATE_ID,
    initialPrivateState: {},
  })) as FoundOfferFilesContract;

  console.log('[browserContract] connect: ready');
  return { contract, providers, compiledContract, config };
}

/**
 * Inspect the maker tx and pick the single segment that carries the swap's
 * shielded/unshielded asset imbalances. Used to decide which balancing
 * strategy `proveAndSubmitOffer` will use.
 */
function pickSwapSegment(makerTx: any): { segId: number; imbalances: Map<any, bigint> } {
  // Lace's makeIntent populates `intents` (Intent objects) and may also touch
  // `fallibleOffer` (ZswapOffer). Union them with segment 0 (guaranteed),
  // then keep only segments with non-empty asset imbalances.
  const intentIds = makerTx.intents ? Array.from(makerTx.intents.keys()) : [];
  const fallibleIds = makerTx.fallibleOffer ? Array.from(makerTx.fallibleOffer.keys()) : [];
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

/**
 * Shielded-only path: maker tx has no Intent slots and asset deltas live in
 * segment 0's guaranteed Zswap offer. `balanceSealedTransaction` can't be
 * used here — it walks `tx.intents` and throws "No segments found in the
 * provided transaction" when the map is empty. Mirror the taker side via
 * `makeIntent` and merge: segment-0 offers compose because they aren't
 * keyed Intents.
 *
 * Unshielded offers are dispatched away from this function in
 * `proveAndSubmitOffer` because Lace's unshielded `makeIntent` adds an
 * empty structural Intent[1] to *both* maker and taker txs, which collides
 * on merge with "key (segment_id) collision during intents merge: 1".
 */
async function balanceShieldedViaMirrorMerge(
  connectedApi: ConnectedAPI,
  makerTx: any,
  swap: { segId: number; imbalances: Map<any, bigint> },
): Promise<{ balancedHex: string; txHash: string }> {
  const { shieldedAddress } = await connectedApi.getShieldedAddresses();
  const { unshieldedAddress } = await connectedApi.getUnshieldedAddress();

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
  // regardless. Pass a non-1 value defensively in case Lace ever changes
  // shielded `makeIntent` to add a structural Intent[1].
  const requestedTakerIntentId: number | 'random' = 1000;

  console.log('[browserContract] complete (mirror+merge): taker mirror', {
    segId: swap.segId,
    makerIntentIds,
    requestedTakerIntentId,
    inputs: takerInputs.map(i => ({ ...i, value: i.value.toString() })),
    outputs: takerOutputs.map(o => ({ ...o, value: o.value.toString() })),
  });

  const { tx: takerTxHex } = await connectedApi.makeIntent(takerInputs, takerOutputs, {
    intentId: requestedTakerIntentId,
    payFees: false,
  });
  console.log('[browserContract] complete (mirror+merge): taker tx hex bytes', takerTxHex.length / 2);

  const takerTx = LedgerV8Transaction.deserialize(
    'signature',
    'proof',
    'binding',
    fromHex(takerTxHex),
  );

  // Full taker tx shape (mirror of the maker tx segment log earlier in
  // proveAndSubmitOffer). Tells us which segIds Lace actually populated and
  // what's in each segment — enough to diagnose any "intents merge: N"
  // collision or zswap-offer composition error.
  const takerIntentIds: number[] = takerTx.intents
    ? Array.from(takerTx.intents.keys() as Iterable<number>)
    : [];
  const takerFallibleIds: number[] = takerTx.fallibleOffer
    ? Array.from(takerTx.fallibleOffer.keys() as Iterable<number>)
    : [];
  console.log('[browserContract] complete (mirror+merge): taker tx shape', {
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
  // A non-empty list here means the dispatch in `proveAndSubmitOffer` is
  // mis-routing an offer that has Intents into mirror+merge.
  const overlap = makerIntentIds.filter((id) => takerIntentIds.includes(id));
  console.log('[browserContract] complete (mirror+merge): about to merge', {
    makerIntentIds,
    takerIntentIds,
    overlapping: overlap,
    expectsCollision: overlap.length > 0,
  });

  const merged = makerTx.merge(takerTx);
  const balancedHex = toHex(merged.serialize());
  const txHash = (merged as any).transactionHash?.() ?? '';
  const mergedIntentIds: number[] = (merged as any).intents
    ? Array.from((merged as any).intents.keys() as Iterable<number>)
    : [];
  console.log('[browserContract] complete (mirror+merge): merged maker + taker', {
    bytes: balancedHex.length / 2,
    txHash,
    mergedIntentIds,
  });
  return { balancedHex, txHash };
}

/**
 * Sealed-balance path: maker tx has at least one Intent slot. Hand the
 * sealed tx to Lace's `balanceSealedTransaction(payFees: false)` — Lace
 * adds the counterparty side, the batcher pays fees in DUST.
 *
 * Reached for unshielded4unshielded (segment-0 deltas + empty Intent[1])
 * and any future numbered-Intent offers. Mirror+merge can't be used here
 * because Lace's unshielded `makeIntent` would put a colliding Intent[1]
 * on the taker side; sealed-balance has no such issue because it doesn't
 * go through `makeIntent` on the taker side.
 */
async function balanceMixedViaSealedBalance(
  connectedApi: ConnectedAPI,
  makerTxHex: string,
): Promise<{ balancedHex: string; txHash: string }> {
  const { tx: balancedHex } = await connectedApi.balanceSealedTransaction(makerTxHex, {
    payFees: false,
  });
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
  console.log('[browserContract] complete (sealed balance): returned', {
    bytes: balancedHex.length / 2,
    txHash,
  });
  return { balancedHex, txHash };
}

/**
 * Complete a maker's bech32m offer blob as the connected browser wallet.
 *
 * Two strategies, dispatched on the maker tx shape:
 *   - segment-0 deltas, no Intent slots (shielded-only) → mirror+merge
 *   - any Intent slot present (unshielded or numbered)  → balanceSealedTransaction
 *
 * Neither strategy works for both cases:
 *   - `balanceSealedTransaction` throws "No segments found in the provided
 *     transaction" on shielded-only offers (it walks `tx.intents`, which is
 *     empty there).
 *   - mirror+merge collides with "key (segment_id) collision during intents
 *     merge: 1" on unshielded offers — Lace's unshielded `makeIntent` always
 *     lands its Intent at segId 1, so maker and taker would both carry it.
 */
export async function proveAndSubmitOffer(
  connectedApi: ConnectedAPI,
  config: MidnightBrowserConfig,
  offerBech32m: string,
): Promise<{ txHash: string }> {
  setNetworkId(config.networkId as NetworkId);

  console.log('[browserContract] complete: decoding offer bytes');
  const rawBytes = decodeOffer(offerBech32m);
  const makerTx = LedgerV8Transaction.deserialize(
    'signature',
    'proof',
    'binding',
    rawBytes,
  );

  // Diagnostic: full segment shape of the maker tx. Drives the dispatch
  // decision below (Intent slot present? → sealed balance; else →
  // mirror+merge) and gives fast triage on any balance/merge error.
  const intentIds = makerTx.intents ? Array.from(makerTx.intents.keys()) : [];
  const fallibleIds = makerTx.fallibleOffer ? Array.from(makerTx.fallibleOffer.keys()) : [];
  console.log('[browserContract] complete: maker tx segments', {
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

  const swap = pickSwapSegment(makerTx);

  // Mirror+merge requires both halves to have no Intent slots (see function
  // docstring). Unshielded makeIntent puts asset deltas in segment 0 but
  // also tacks on an empty Intent[1] — that empty Intent doesn't move
  // `swap.segId` away from 0, so the segId test alone is insufficient.
  const makerHasIntents = !!makerTx.intents
    && Array.from(makerTx.intents.keys() as Iterable<number>).length > 0;
  const useMirrorMerge = swap.segId === 0 && !makerHasIntents;
  const strategy = useMirrorMerge
    ? 'mirror+merge (segment 0 / guaranteed offer)'
    : 'balanceSealedTransaction (numbered Intent)';
  console.log('[browserContract] complete: chose strategy', {
    segId: swap.segId,
    strategy,
  });

  let balancedHex: string;
  let txHash: string;
  try {
    if (useMirrorMerge) {
      ({ balancedHex, txHash } = await balanceShieldedViaMirrorMerge(
        connectedApi,
        makerTx,
        swap,
      ));
    } else {
      ({ balancedHex, txHash } = await balanceMixedViaSealedBalance(
        connectedApi,
        toHex(rawBytes),
      ));
    }
  } catch (e: any) {
    console.error('[browserContract] complete: balancing failed', {
      strategy,
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
    (await connectedApi.getShieldedAddresses()).shieldedCoinPublicKey,
    config.networkId as NetworkId,
  );

  console.log('[browserContract] complete: submitting to batcher', { txHash });
  try {
    await submitToBatcher(balancedHex, 'finalized', coinPublicKeyHex);
  } catch (e: any) {
    console.error('[browserContract] complete: batcher submit failed', {
      message: e?.message,
      raw: e,
    });
    throw new Error(
      `Batcher submit failed: ${e?.message ?? JSON.stringify(e) ?? 'unknown'}`,
      { cause: e },
    );
  }

  console.log('[browserContract] complete: done', { txHash });
  return { txHash };
}
