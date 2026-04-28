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
import { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
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
const KNOWN_CIRCUITS: ReadonlySet<string> = new Set<OfferFilesCircuits>([
  'mint_shielded',
  'mint_unshielded',
  'incrementNoun',
]);

/**
 * Wraps FetchZkConfigProvider so that requests for circuit ids we don't host
 * (ledger primitives: spend/output/sign/dust; anything Lace-internal) throw
 * immediately without making an HTTP call.
 *
 * httpClientProofProvider treats a thrown `.get()` as "don't bundle key
 * material — let the proof server use its own cache". Shortcutting the fetch
 * here avoids both (a) a handful of 404 roundtrips per proof and (b) the
 * cliff we previously fell off when Vite's SPA fallback served HTML for
 * missing artifact paths.
 */
class KnownCircuitZkConfigProvider extends ZKConfigProvider<string> {
  private readonly inner: FetchZkConfigProvider<string>;
  constructor(baseURL: string, fetchFn: typeof fetch) {
    super();
    this.inner = new FetchZkConfigProvider<string>(baseURL, fetchFn);
  }
  private guard(circuitId: string): void {
    if (!KNOWN_CIRCUITS.has(circuitId)) {
      throw new Error(`ZK artifact not hosted by dapp: ${circuitId}`);
    }
  }
  getProverKey(circuitId: string) {
    this.guard(circuitId);
    return this.inner.getProverKey(circuitId);
  }
  getVerifierKey(circuitId: string) {
    this.guard(circuitId);
    return this.inner.getVerifierKey(circuitId);
  }
  getZKIR(circuitId: string) {
    this.guard(circuitId);
    return this.inner.getZKIR(circuitId);
  }
}
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

export type OfferProofState = 'unproven' | 'proven-unbound' | 'proven-bound';

/**
 * Detect what proof/binding state a serialized maker offer is in. Backend-made
 * offers (wallet-sdk `initSwap`) are <Sig, PreProof, PreBinding>; Lace-made
 * offers (`makeIntent`) are <Sig, Proof, Binding> because Lace can't expose
 * the proof preimage without leaking witness material derived from the
 * shielded spending key. We sniff by trying each in order — the bytes
 * deserialize cleanly in exactly one shape.
 */
export function detectOfferProofState(rawBytes: Uint8Array): OfferProofState {
  const candidates: ReadonlyArray<readonly [
    'signature',
    'pre-proof' | 'proof',
    'pre-binding' | 'binding',
    OfferProofState,
  ]> = [
    ['signature', 'proof', 'binding', 'proven-bound'],
    ['signature', 'proof', 'pre-binding', 'proven-unbound'],
    ['signature', 'pre-proof', 'pre-binding', 'unproven'],
  ];
  let lastError: unknown = null;
  for (const [s, p, b, name] of candidates) {
    try {
      LedgerV8Transaction.deserialize(s, p, b, rawBytes);
      return name;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Offer bytes don't deserialize as any known Transaction shape: ${
      (lastError as any)?.message ?? String(lastError)
    }`,
  );
}

/**
 * Take a maker's bech32m offer blob and complete it as the connected browser
 * wallet, then let the wallet submit it to Midnight.
 *
 * Branches on the maker's proof state:
 *  - <Sig, PreProof, PreBinding>: prove via the external proof server, then
 *    `balanceUnsealedTransaction(payFees:true)`.
 *  - <Sig, Proof, PreBinding>: skip proving, `balanceUnsealedTransaction(payFees:true)`.
 *  - <Sig, Proof, Binding>: skip proving, `balanceSealedTransaction(payFees:true)` —
 *    the taker contributes a new sealed segment that fixes the imbalance.
 *
 * In every case the taker's wallet ends up paying the full tx fees with `payFees:true`.
 */
export async function proveAndSubmitOffer(
  connectedApi: ConnectedAPI,
  config: MidnightBrowserConfig,
  offerBech32m: string,
): Promise<{ txHash: string }> {
  console.log('[browserContract] complete: decoding offer bytes');
  const rawBytes = decodeOffer(offerBech32m);
  const proofState = detectOfferProofState(rawBytes);
  console.log(`[browserContract] complete: detected proof state = ${proofState}`);

  let toBalanceHex: string;

  if (proofState === 'unproven') {
    const unprovenTx = LedgerV8Transaction.deserialize(
      'signature',
      'pre-proof',
      'pre-binding',
      rawBytes,
    );

    console.log('[browserContract] complete: building proofProvider');
    const zkConfigProvider = new KnownCircuitZkConfigProvider(
      window.location.origin,
      fetch.bind(window),
    );
    const proofProvider = httpClientProofProvider(config.proofServerUri, zkConfigProvider);

    console.log('[browserContract] complete: proving offer via proof server');
    const provenTx = await proofProvider.proveTx(unprovenTx as any);
    const provenBytes = provenTx.serialize();
    toBalanceHex = toHex(provenBytes);

    const nonZero = provenBytes.reduce((n, b) => n + (b !== 0 ? 1 : 0), 0);
    if (nonZero === 0) {
      throw new Error('Proven tx bytes are all zeros — proof server returned empty payload');
    }

    try {
      LedgerV8Transaction.deserialize('signature', 'proof', 'pre-binding', provenBytes);
    } catch (e) {
      throw new Error(
        'Proven transaction is not Transaction<Signature, Proof, PreBinding>: ' +
          ((e as Error).message ?? String(e)),
      );
    }
  } else {
    // Already proven by the maker's wallet — pass bytes through untouched.
    toBalanceHex = toHex(rawBytes);
  }

  const useSealed = proofState === 'proven-bound';
  console.log('[browserContract] complete: balancing via wallet', {
    method: useSealed ? 'balanceSealedTransaction' : 'balanceUnsealedTransaction',
    bytes: toBalanceHex.length / 2,
  });
  const { tx: balancedHex } = useSealed
    ? await connectedApi.balanceSealedTransaction(toBalanceHex, { payFees: true })
    : await connectedApi.balanceUnsealedTransaction(toBalanceHex, { payFees: true });

  // Derive the tx hash from the balanced+sealed bytes before submission so we
  // can surface it in the UI.
  let txHash = '';
  try {
    const balancedTx = LedgerV8Transaction.deserialize(
      'signature',
      'proof',
      'binding',
      fromHex(balancedHex),
    );
    txHash = (balancedTx as any).transactionHash?.() ?? '';
  } catch (e) {
    console.warn('[browserContract] complete: failed to derive txHash from balanced tx', e);
  }

  console.log('[browserContract] complete: submitTransaction', { txHash });
  await connectedApi.submitTransaction(balancedHex);
  return { txHash };
}
