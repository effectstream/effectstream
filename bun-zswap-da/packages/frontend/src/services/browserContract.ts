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
): Promise<FoundOfferFilesContract> {
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
  return contract;
}

/**
 * Complete a maker's bech32m offer blob as the connected browser wallet.
 *
 * The connector's `balance{Un,}sealedTransaction` methods can only balance
 * intents the wallet itself created — passing in a counterparty's tx fails
 * with "No segments found in the provided transaction". The cross-party swap
 * pattern the connector spec describes is:
 *
 *   1. Maker calls makeIntent({inputs: gives, outputs: wants→maker_addr},
 *                              { intentId: R, payFees: false })
 *   2. Taker reads R + imbalances out of the maker's tx, then calls
 *      makeIntent({inputs: maker_wants, outputs: maker_gives→taker_addr},
 *                  { intentId: R, payFees: false })   ← same R
 *   3. Dapp merges the two <Sig, Proof, Binding> txs at the ledger level.
 *   4. Merged tx is asset-balanced + fee-imbalanced. Hand to the batcher
 *      ('finalized'); batcher adds DUST and submits.
 *
 * Only Lace's `makeIntent` shape (<Sig, Proof, Binding>) is supported — the
 * demo no longer creates offers any other way.
 */
export async function proveAndSubmitOffer(
  connectedApi: ConnectedAPI,
  config: MidnightBrowserConfig,
  offerBech32m: string,
): Promise<{ txHash: string }> {
  // ledger-v8 deserialize is network-scoped; set the global before any parse.
  setNetworkId(config.networkId as NetworkId);

  console.log('[browserContract] complete: decoding offer bytes');
  const rawBytes = decodeOffer(offerBech32m);

  // Lace's makeIntent produces <Sig, Proof, Binding>.
  let makerTx;
  try {
    makerTx = LedgerV8Transaction.deserialize(
      'signature',
      'proof',
      'binding',
      rawBytes,
    );
  } catch (e: any) {
    throw new Error(
      `Offer bytes don't deserialize as <signature, proof, binding>: ${e?.message ?? String(e)}`,
      { cause: e },
    );
  }

  // Find the swap segment. Lace's makeIntent typically populates the `intents`
  // map (Intent objects, keyed by intentId) and may or may not also touch
  // `fallibleOffer` (ZswapOffer, also keyed by segment id) — depends on the
  // wallet's implementation and what kinds (shielded/unshielded) the swap
  // involves. Union both, plus segment 0 (guaranteed), then keep only segments
  // with non-empty asset imbalances.
  const intentIds = makerTx.intents ? Array.from(makerTx.intents.keys()) : [];
  const fallibleIds = makerTx.fallibleOffer ? Array.from(makerTx.fallibleOffer.keys()) : [];
  const candidateSegs = Array.from(new Set<number>([0, ...intentIds, ...fallibleIds]));
  console.log('[browserContract] complete: candidate segment ids', {
    intents: intentIds, fallible: fallibleIds, considered: candidateSegs,
  });

  // Pick the segment(s) with shielded/unshielded asset imbalances. Skip dust
  // and skip segments whose imbalances are entirely zero.
  const swapSegs: Array<{ segId: number; imbalances: Map<any, bigint> }> = [];
  for (const segId of candidateSegs) {
    let imb: Map<any, bigint>;
    try {
      imb = makerTx.imbalances(segId) as Map<any, bigint>;
    } catch (e) {
      console.log(`[browserContract] complete: imbalances(${segId}) threw, skipping`, e);
      continue;
    }
    const hasAssets = Array.from(imb.entries()).some(([tt, v]) => {
      const tag = (tt as any).tag;
      return (tag === 'shielded' || tag === 'unshielded') && v !== 0n;
    });
    if (hasAssets) swapSegs.push({ segId, imbalances: imb });
  }

  if (swapSegs.length === 0) {
    throw new Error(
      'Maker offer has no segments with shielded/unshielded asset imbalances — ' +
        `nothing to mirror. (intent ids: ${JSON.stringify(intentIds)}, fallible ids: ${JSON.stringify(fallibleIds)})`,
    );
  }
  if (swapSegs.length > 1) {
    throw new Error(
      `Multi-segment offers are not supported (found asset imbalances in segments ${
        swapSegs.map(s => s.segId).join(', ')
      }).`,
    );
  }
  const { segId, imbalances } = swapSegs[0];
  console.log(`[browserContract] complete: using segment id ${segId}`);

  // Compute taker's mirror inputs/outputs from the segment's imbalances.
  //  +N for token T  →  maker spent N of T, taker should receive N of T   (taker output)
  //  -N for token T  →  maker outputs N of T, taker should provide N of T (taker input)
  console.log('[browserContract] complete: maker segment imbalances',
    Array.from(imbalances.entries()).map(([tt, v]) =>
      ({ tag: (tt as any).tag, raw: (tt as any).raw, delta: v.toString() })));

  const { shieldedAddress } = await connectedApi.getShieldedAddresses();
  const { unshieldedAddress } = await connectedApi.getUnshieldedAddress();

  type DesiredInput = { kind: 'shielded' | 'unshielded'; type: string; value: bigint };
  type DesiredOutput = DesiredInput & { recipient: string };
  const takerInputs: DesiredInput[] = [];
  const takerOutputs: DesiredOutput[] = [];

  for (const [tt, delta] of imbalances) {
    const tag = (tt as any).tag as 'shielded' | 'unshielded' | 'dust';
    if (tag === 'dust') continue; // batcher pays
    if (tag !== 'shielded' && tag !== 'unshielded') {
      console.warn(`[browserContract] complete: skipping unknown token tag "${tag}"`);
      continue;
    }
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

  if (takerInputs.length === 0 && takerOutputs.length === 0) {
    throw new Error('Maker offer has no asset imbalances to mirror — nothing to complete.');
  }
  console.log('[browserContract] complete: taker mirror', {
    inputs: takerInputs.map(i => ({ ...i, value: i.value.toString() })),
    outputs: takerOutputs.map(o => ({ ...o, value: o.value.toString() })),
  });

  // Build the taker's matching intent at the SAME segment id so the merge
  // collapses the two halves into one balanced segment.
  let takerTxHex: string;
  try {
    const result = await connectedApi.makeIntent(takerInputs, takerOutputs, {
      intentId: segId,
      payFees: false,
    });
    takerTxHex = result.tx;
    console.log('[browserContract] complete: taker makeIntent returned', {
      bytes: takerTxHex.length / 2,
    });
  } catch (e: any) {
    console.error('[browserContract] complete: taker makeIntent failed', {
      name: e?.name,
      message: e?.message,
      raw: e,
    });
    throw new Error(
      `Taker makeIntent failed: ${e?.message ?? e?.name ?? 'unknown'}`,
      { cause: e },
    );
  }

  const takerTx = LedgerV8Transaction.deserialize(
    'signature',
    'proof',
    'binding',
    fromHex(takerTxHex),
  );

  // Merge maker + taker → fully asset-balanced <Sig, Proof, Binding>.
  let mergedHex: string;
  let txHash = '';
  try {
    const merged = makerTx.merge(takerTx);
    mergedHex = toHex(merged.serialize());
    txHash = (merged as any).transactionHash?.() ?? '';
    console.log('[browserContract] complete: merged maker + taker', {
      bytes: mergedHex.length / 2,
      txHash,
    });
  } catch (e: any) {
    console.error('[browserContract] complete: merge failed', e);
    throw new Error(
      `Failed to merge maker + taker transactions: ${e?.message ?? String(e)}`,
      { cause: e },
    );
  }

  // Send to the batcher with 'finalized' stage; the batcher's seed wallet
  // adds the DUST segment and submits. Same flow as mint_shielded.
  const coinPublicKeyHex = parseCoinPublicKeyToHex(
    (await connectedApi.getShieldedAddresses()).shieldedCoinPublicKey,
    config.networkId as NetworkId,
  );

  console.log('[browserContract] complete: submitting to batcher', { txHash });
  try {
    await submitToBatcher(mergedHex, 'finalized', coinPublicKeyHex);
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
