import {
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "@evm-midnight/midnight-contract";
import { CompiledContract, type Contract } from "@midnight-ntwrk/compact-js";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  createMidnightProviderFromHandlers,
  createWalletProviderFromHandlers,
  type MidnightProvider,
  type MidnightProviders,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import {
  BASE_URL_MIDNIGHT_INDEXER_API,
  BASE_URL_MIDNIGHT_INDEXER_WS,
  BASE_URL_PROOF_SERVER,
  MIDNIGHT_NETWORK_ID,
  getMidnightNodeUrl,
} from "./config.ts";
import {
  ContractState,
  LedgerParameters,
  Transaction,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
  type CoinPublicKey,
  type EncPublicKey,
} from "@midnightntwrk/ledger-v9";

// Modular SDK imports
import { HDWallet, Roles, type Role } from "@midnightntwrk/wallet-sdk-hd";
import {
  type DefaultConfiguration,
  DefaultForkSchedule,
  WalletFacade,
} from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import {
  InMemoryTransactionHistoryStorage,
  NetworkId,
  ProtocolVersion,
  TransactionHistoryStorage,
  WalletTransaction,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { Buffer } from "buffer";

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

/** Additional fee overhead for dust transactions (in smallest unit) */
const DUST_FEE_OVERHEAD = 300_000_000_000_000n;

/** Fee blocks margin for dust wallet */
const DUST_FEE_BLOCKS_MARGIN = 5;

// Throttle on the wallet state observable, applied before the isSynced filter.
// Keep short in-browser — large values delay connect even on already-synced chains.
const WALLET_SYNC_THROTTLE_MS = 250;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

// ============================================================================
// Types
// ============================================================================

// Inlined common types for standalone script
type CounterCircuits = Contract.ProvableCircuitId<Counter.Contract<CounterPrivateState>>;

const CounterPrivateStateId = "counterPrivateState";

type CounterProviders = MidnightProviders<
  CounterCircuits,
  typeof CounterPrivateStateId,
  CounterPrivateState
>;

type CounterContract = Counter.Contract;

type DeployedCounterContract =
  | DeployedContract<CounterContract>
  | FoundContract<CounterContract>;

interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

class StandaloneConfig implements Config {
  logDir = `standalone-${new Date().toISOString()}.log`;
  indexer = BASE_URL_MIDNIGHT_INDEXER_API;
  indexerWS = BASE_URL_MIDNIGHT_INDEXER_WS;
  node: string;
  proofServer = BASE_URL_PROOF_SERVER;
  constructor(nodeUrl: string) {
    this.node = nodeUrl;
  }
}

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

// ============================================================================
// Wallet Logic (Adapted from get-wallet-info.ts)
// ============================================================================

export interface NetworkUrls {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
}

export interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  walletDustSecretKey: DustSecretKey;
  dustAddress: string;
  unshieldedAddress: string;
  unshieldedKeystore: UnshieldedKeystore;
}

function createTtl(): Date {
  return new Date(Date.now() + TTL_DURATION_MS);
}

export function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>,
  networkId: NetworkId.NetworkId,
): DefaultConfiguration {
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: networkId,
    costParameters: {
      feeBlocksMargin: DUST_FEE_BLOCKS_MARGIN,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryEntryCommonSchema,
    ),
  };
}

/** Derives the account-0 / index-0 key seed for one HD role. */
function deriveSeedForRole(seed: string, role: Role): Uint8Array {
  const hdResult = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdResult.type !== "seedOk") {
    throw new Error(`Failed to create HD wallet: ${hdResult.type}`);
  }
  const derivation = hdResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);
  hdResult.hdWallet.clear();
  if (derivation.type !== "keyDerived") {
    throw new Error(`Key derivation failed for role ${role}: ${derivation.type}`);
  }
  return Buffer.from(derivation.key);
}

export async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const unshieldedKeystore = createKeystore(
    { kind: "schnorr", secret: unshieldedSeed },
    networkId,
  );
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  const config = createWalletConfiguration(networkUrls, networkId);
  const dustParameters = LedgerParameters.initialParameters().dust;

  const wallet = await WalletFacade.init({
    configuration: config,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(shieldedSeed),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSeed(dustSeed, dustParameters),
  });

  // wallet-sdk 2 starts every sub-wallet from its role seed.
  await wallet.start({
    shielded: shieldedSeed,
    unshielded: unshieldedSeed,
    dust: dustSeed,
  });

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys: zswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey: dustSecretKey,
    dustAddress: "",
    unshieldedAddress,
    unshieldedKeystore,
  };
}

export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean }
): Promise<bigint> {
  console.log("Waiting for dust wallet to sync and receive funds...");
  
  const options = typeof optionsOrTimeout === 'number' 
    ? { timeoutMs: optionsOrTimeout } 
    : optionsOrTimeout;
    
  const syncTimeoutMs = options?.timeoutMs ?? WALLET_SYNC_TIMEOUT_MS;
  const waitNonZero = options?.waitNonZero ?? false;
  
  // deno-lint-ignore no-explicit-any
  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    console.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    dustWallet.state.pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        try {
          const progress = state.state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          console.log(`Dust wallet sync progress: complete=${complete ?? "unknown"}`);
        } catch (_err) {
          // ignore logging errors
        }
      }),
      Rx.filter((state: any) => {
        try {
          const progress = state.state?.progress;
          return progress?.isCompleteWithin?.(0n) === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: any) => {
        // Try to read balance from wallet state helper if present.
        try {
          if (typeof state.walletBalance === "function") {
            return state.walletBalance(new Date());
          }
          // Fallback to balances map if exposed
          const balances = state.balances;
          if (balances) {
            return Object.values(balances).reduce(
              (acc: bigint, v) => acc + BigInt((v as any) ?? 0),
              0n
            );
          }
        } catch (_err) {
          // ignore and fall through
        }
        return 0n;
      }),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      }),
      Rx.filter((balance: bigint) => !waitNonZero || balance > 0n),
      Rx.tap((balance: bigint) => {
        if (balance > 0n) console.log(`Dust wallet balance: ${balance}`);
      })
    )
  )) as bigint;

  return dustBalance;
}

export async function registerNightForDust(walletResult: WalletResult): Promise<boolean> {
  console.log("Checking for unshielded Night UTXOs to register for dust generation...");
  
  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(
      Rx.filter((s: any) => s.isSynced)
    )
  );

  // Check if we have unshielded coins that are not registered for dust generation
  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter((coin: any) => coin.meta.registeredForDustGeneration === false) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    console.log("No unregistered unshielded Night UTXOs available.");
    // Check current dust balance
    const dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: 5000 });
    return dustBalance > 0n;
  }

  console.log(`Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`);

  try {
    const recipe = await walletResult.wallet.registerNightUtxosForDustGeneration(
      unregisteredNightUtxos,
      walletResult.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signDataAsync(payload)
    );

    console.log("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(await walletResult.wallet.finalizeRecipe(recipe));
    console.log(`Dust registration submitted with tx id: ${txId}`);

    // Wait for dust to be available
    console.log("Waiting for dust to be generated...");
    await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const dustBalance = s.dust?.walletBalance?.(new Date()) ?? 0n;
          console.log(`Current dust balance: ${dustBalance}`);
        }),
        Rx.filter((s: any) => (s.dust?.walletBalance?.(new Date()) ?? 0n) > 0n),
        Rx.timeout({
          each: WALLET_SYNC_TIMEOUT_MS,
          with: () => Rx.throwError(() => new Error("Timeout waiting for dust generation"))
        })
      )
    );

    console.log("Dust registration complete!");
    return true;
  } catch (e) {
    console.error(`Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export async function syncAndWaitForFunds(
  walletResult: WalletResult,
  options?: { timeoutMs?: number; waitNonZero?: boolean },
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }> {
  console.log(
    "Waiting for wallet to sync and receive funds (shielded/unshielded/dust)..."
  );

  const wallet = walletResult.wallet;
  const syncTimeoutMs = options?.timeoutMs ?? WALLET_SYNC_TIMEOUT_MS;
  const waitNonZero = options?.waitNonZero ?? false;
  let latestState: any = null;

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        latestState = state;
        const isSynced = state.isSynced ?? false;
        const shieldedSynced =
          state.shielded.state.progress.isStrictlyComplete() || isSynced;
        const dustSynced = state.dust.state.progress.isStrictlyComplete() || isSynced;
        const unshieldedSynced = state.unshielded?.syncProgress?.synced ?? isSynced;
        console.log(
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`
        );
      }),
      Rx.filter(
        (state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedSynced = state.shielded.state.progress.isStrictlyComplete() || isSynced;
          const dustSynced = state.dust.state.progress.isStrictlyComplete() || isSynced;
          const unshieldedSynced = state.unshielded?.syncProgress?.synced ?? isSynced;
          
          if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;
          
          if (waitNonZero) {
            const tokenObj = shieldedToken();
            const tokenId = tokenObj.raw;
            const shieldedBalance = state.shielded.balances[tokenId] ?? 0n;
            return shieldedBalance > 0n;
          }
          
          return true;
        }
      ),
      Rx.tap(() => console.log("Wallet sync complete")),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      })
    )
  );

  // Get the actual token identifier - use the .raw property which is the hex string
  const tokenObj = shieldedToken();
  const tokenId = tokenObj.raw;

  const shieldedBalancesObj = state.shielded.balances || {};
  const shieldedBalance = shieldedBalancesObj[tokenId] ?? 0n;
  
  // Handle unshielded balances
  const unshieldedBalances = 
    // deno-lint-ignore no-explicit-any
    ((state as any).unshielded?.balances as Map<string, bigint> | Record<string, bigint> | undefined);
  
  let unshieldedBalance = 0n;
  if (unshieldedBalances) {
    if (unshieldedBalances instanceof Map) {
      unshieldedBalance = Array.from(unshieldedBalances.values()).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n
      );
    } else {
      unshieldedBalance = Object.values(unshieldedBalances).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n
      );
    }
  }
  
  // Try to resolve dust balance; if unavailable or times out, return 0n
  let dustBalance = 0n;
  try {
    dustBalance = await waitForDustFunds(wallet, { timeoutMs: syncTimeoutMs, waitNonZero });
  } catch (_err) {
    console.warn("Dust wallet did not report funds within timeout; continuing with dustBalance=0");
  }

  // If we have unshielded funds but no dust, try to register
  if (dustBalance === 0n && unshieldedBalance > 0n) {
      const success = await registerNightForDust(walletResult);
      if (success) {
          dustBalance = await waitForDustFunds(wallet, { timeoutMs: 30000 });
      }
  }
  
  return { shieldedBalance, unshieldedBalance, dustBalance };
}


// midnight-js 5 hands providers ledger-v9 transactions; wallet-sdk 2 takes and
// returns sealed `WalletTransaction` handles. The two helpers below convert
// between them at the protocol version the wallet is acting at. Both sides use
// the single `@midnightntwrk/ledger-v9` copy the package.json overrides pin.

async function walletProtocolVersion(
  wallet: WalletFacade,
): Promise<ProtocolVersion.ProtocolVersion> {
  return (await Rx.firstValueFrom(wallet.state())).activeProtocolVersion;
}

/** Seals a ledger-v9 transaction as a wallet-sdk handle at the active protocol version. */
async function adoptInWallet<S extends "Unbound" | "Finalized">(
  wallet: WalletFacade,
  stage: S,
  tx: { serialize(): Uint8Array },
): Promise<WalletTransaction<S>> {
  const bytes = tx.serialize();
  const decoded = stage === "Unbound"
    ? Transaction.deserialize("signature", "proof", "pre-binding", bytes)
    : Transaction.deserialize("signature", "proof", "binding", bytes);
  return WalletTransaction.adopt(stage, decoded, await walletProtocolVersion(wallet));
}

/** Reads the bytes of a finalized wallet-sdk handle sealed for the current epoch. */
async function finalizedFromWallet(
  wallet: WalletFacade,
  handle: WalletTransaction<"Finalized">,
): Promise<Uint8Array> {
  const epoch = ProtocolVersion.epochOf(
    await walletProtocolVersion(wallet),
    DefaultForkSchedule.v9,
  );
  const unwrapped = WalletTransaction.unwrapWithin<Transaction<any, any, any>>(handle, epoch);
  if (unwrapped._tag === "Left") throw unwrapped.left;
  return unwrapped.right.serialize();
}

function createWalletAndMidnightProvider(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  unshieldedKeystore: UnshieldedKeystore,
): { walletProvider: WalletProvider; midnightProvider: MidnightProvider } {
  const walletProvider = createWalletProviderFromHandlers({
    v8: undefined,
    v9: async (tx, ttl) => {
      const recipe = await wallet.balanceUnboundTransaction(
        await adoptInWallet(wallet, "Unbound", tx),
        { ttl: ttl ?? createTtl() },
      );
      const signed = await wallet.signRecipe(
        recipe,
        (payload) => unshieldedKeystore.signDataAsync(payload),
      );
      return finalizedFromWallet(wallet, await wallet.finalizeRecipe(signed));
    },
    getCoinPublicKey: (): CoinPublicKey => zswapSecretKeys.coinPublicKey,
    getEncryptionPublicKey: (): EncPublicKey => zswapSecretKeys.encryptionPublicKey,
  });
  const midnightProvider = createMidnightProviderFromHandlers({
    v8: undefined,
    v9: async (tx) =>
      wallet.submitTransaction(await adoptInWallet(wallet, "Finalized", tx)),
  });
  return { walletProvider, midnightProvider };
}

// ============================================================================
// Counter Logic
// ============================================================================

const counterContractInstance: CounterContract = new Counter.Contract(
  witnesses,
);

const getCounterLedgerState = async (
  providers: CounterProviders,
  contractAddress: ContractAddress,
): Promise<bigint | null> => {
  assertIsContractAddress(contractAddress);
  console.log("🔍 Checking contract ledger state...");

  try {
    const contractState = await providers.publicDataProvider.queryContractState(
      contractAddress,
    );
    const state = contractState != null
      ? Counter.ledger(
        contractState.contractState.deserialize({ v9: ContractState }).data,
      ).round
      : null;
    console.log(`📊 Ledger state: ${state}`);
    return state;
  } catch (error) {
    console.error("❌ Error getting counter ledger state:", error);
    throw error;
  }
};

const joinContract = async (
  providers: CounterProviders,
  contractAddress: string,
): Promise<DeployedCounterContract> => {
  const compiledContract = CompiledContract.make('contract-round-value', Counter.Contract).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets('./'),
  );

  const counterContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract,
    privateStateId: "counterPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${counterContract.deployTxData.public.contractAddress}`,
  );
  return counterContract;
};

const increment = async (
  counterContract: DeployedCounterContract,
  contractAddress: string,
  tokenId: string,
  propertyName: string,
  propertyValue: string,
): Promise<any> => {
  console.log("Incrementing...");

  console.log(`📝 Using parameters:`);
  console.log(`   Contract Address: ${contractAddress}`);
  console.log(`   Token ID: ${tokenId}`);
  console.log(`   Property Name: ${propertyName}`);
  console.log(`   Property Value: ${propertyValue}`);

  const toEncodedString = (str: string, length = 32) =>
    Uint8Array.from(
      str.padEnd(length, " ").split("").map((c) => c.charCodeAt(0)),
    );
  const finalizedTxData = await counterContract.callTx.increment(
    toEncodedString(contractAddress, 64),
    toEncodedString(tokenId, 64),
    toEncodedString(propertyName, 32),
    toEncodedString(propertyValue, 32),
  );
  console.log(
    `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  return finalizedTxData.public;
};

const displayCounterValue = async (
  providers: CounterProviders,
  counterContract: DeployedCounterContract,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const contractAddress = counterContract.deployTxData.public.contractAddress;
  const counterValue = await getCounterLedgerState(providers, contractAddress);
  if (counterValue === null) {
    console.log(`There is no counter contract deployed at ${contractAddress}.`);
  } else {
    console.log(`Current counter value: ${Number(counterValue)}`);
  }
  return { contractAddress, counterValue };
};

const configureProviders = async (
  walletResult: WalletResult,
  config: Config,
) => {
  const { walletProvider, midnightProvider } = createWalletAndMidnightProvider(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.unshieldedKeystore,
  );

  const privateStateProvider = levelPrivateStateProvider({
    privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
    accountId: walletResult.unshieldedAddress || "default-account",
  } as any);

  const publicDataProvider = indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  );

  const zkConfigPath = window.location.origin;

  // Serves keys/, zkir/ and the compiler/ integrity manifest (see vite.config.ts).
  const zkConfigProvider = new FetchZkConfigProvider<CounterCircuits>(zkConfigPath, {
    fetchFunc: fetch.bind(window),
  });
  const proofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);

  const providers: CounterProviders = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    config: {
      networkId: MIDNIGHT_NETWORK_ID,
      ttlSeconds: TTL_DURATION_MS / 1000,
    },
  };
  return providers;
};

/**
 * Get contract address from command line arguments or from a file
 */
const getContractAddress = async (): Promise<string> => {
  const candidates = [
    `contract_address/contract-round-value.${MIDNIGHT_NETWORK_ID}.json`,
    `contract_address/contract-round-value.json`,
    `contract_address/contract.json`,
  ];

  for (const candidate of candidates) {
    try {
      const r = await fetch(candidate);
      if (!r.ok) continue;
      const json = await r.json();
      
      // Handle network-keyed address if present
      if (typeof json.contractAddress === 'object') {
        const address = json.contractAddress[MIDNIGHT_NETWORK_ID];
        if (address) {
          console.log(`🔍 Contract address (${MIDNIGHT_NETWORK_ID}) from ${candidate}:`, address);
          return address;
        }
        continue;
      }
      
      if (json.contractAddress) {
        console.log(`🔍 Contract address from ${candidate}:`, json.contractAddress);
        return json.contractAddress;
      }
    } catch (e) {
      // ignore and try next
    }
  }

  throw new Error(`Could not resolve contract address for network ${MIDNIGHT_NETWORK_ID}`);
};

// Separate functions for Web App use
// Global variables updated to hold new types
let globalWallet: WalletFacade | null = null;
let globalProviders: CounterProviders | null = null;
let globalCounterContract: DeployedCounterContract | null = null;

const connectMidnightWallet = async (): Promise<{
  wallet: WalletFacade;
  providers: CounterProviders;
}> => {
  // Reuse cached wallet — first build is slow (WASM init + chain scan).
  if (globalWallet && globalProviders) {
    console.log("♻️  Reusing already-built Midnight wallet");
    return { wallet: globalWallet, providers: globalProviders };
  }

  console.log("🔗 Building Midnight wallet with genesis seed...");

  const midnightNodeUrl = await getMidnightNodeUrl();
  const config = new StandaloneConfig(midnightNodeUrl);
  
  // New Modular Wallet Construction
  const networkUrls = {
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      proofServer: config.proofServer
  };
  
  // Use MIDNIGHT_NETWORK_ID from config/env
  const networkId = MIDNIGHT_NETWORK_ID as NetworkId.NetworkId;
  
  console.log(`Using network ID: ${networkId}`);
  
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_MINT_WALLET_SEED, networkId);
  console.log("✅ Wallet built successfully");

  // Sync and wait for funds
  const { shieldedBalance, unshieldedBalance, dustBalance } = await syncAndWaitForFunds(walletResult);
  console.log(`✅ Wallet synced. Shielded: ${shieldedBalance}, Dust: ${dustBalance}, Unshielded: ${unshieldedBalance}`);

  const providers = await configureProviders(walletResult, config);
  console.log("✅ Providers configured successfully");

  // We attach the `state` observable mapping for UI compatibility
  const walletFacade = walletResult.wallet;
  
  // Helper to map state for UI
  const originalState = walletFacade.state;
  // @ts-ignore - Monkey patching for compatibility
  walletFacade.state = () => originalState.call(walletFacade).pipe(
    Rx.map((s: any) => {
      // Map shielded address to top level address property for UI
      const address = s.shielded?.address?.coinPublicKeyString?.() || "";
      return {
        ...s,
        address
      };
    })
  );

  // Store globally for later use
  globalWallet = walletFacade as any;
  globalProviders = providers;

  return { wallet: walletFacade as any, providers };
};

const connectToContract = async (
  providers: CounterProviders,
  contractAddress?: string,
): Promise<{
  counterContract: DeployedCounterContract;
  currentState: { counterValue: bigint | null; contractAddress: string };
}> => {
  const address = contractAddress || await getContractAddress();
  console.log(`🔗 Joining counter contract at address: ${address}`);

  const counterContract = await joinContract(providers, address);
  console.log("✅ Successfully joined the counter contract");

  // Get initial state
  const currentState = await displayCounterValue(providers, counterContract);
  console.log(`📊 Current counter value: ${currentState.counterValue}`);

  // Store globally for later use
  globalCounterContract = counterContract;

  return { counterContract, currentState };
};

const fetchCurrentCounterState = async (
  providers?: CounterProviders,
  counterContract?: DeployedCounterContract,
): Promise<{ counterValue: bigint | null; contractAddress: string }> => {
  const actualProviders = providers || globalProviders;
  const actualContract = counterContract || globalCounterContract;

  if (!actualProviders || !actualContract) {
    throw new Error("Providers and contract must be initialized first");
  }

  return await displayCounterValue(actualProviders, actualContract);
};

const incrementCounterValue = async (
  contractAddress: string,
  tokenId: string,
  propertyName: string,
  propertyValue: string,
  counterContract?: DeployedCounterContract,
): Promise<any> => {
  const actualContract = counterContract || globalCounterContract;

  if (!actualContract) {
    throw new Error("Contract must be joined first");
  }

  console.log("🔢 Incrementing counter...");
  const result = await increment(
    actualContract,
    contractAddress,
    tokenId,
    propertyName || "",
    propertyValue || "",
  );
  console.log(
    `✅ Counter incremented successfully! Transaction ID: ${result.txId}`,
  );

  return result;
};

export {
  connectMidnightWallet,
  connectToContract,
  fetchCurrentCounterState,
  incrementCounterValue,
};
