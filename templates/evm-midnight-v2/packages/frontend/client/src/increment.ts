import {
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Counter,
  type CounterPrivateState,
  witnesses,
} from "@evm-midnight/midnight-contract";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  Transaction,
  type TransactionId,
} from "@midnightntwrk/ledger-v9";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";

import {
  type ImpureCircuitId,
  type MidnightProvider,
  type MidnightProviders,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { MIDNIGHT_NETWORK_ID } from "./config.ts";
import {
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
} from "@midnightntwrk/ledger-v9";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import type { WalletResult } from "@effectstream/midnight-contracts/types";
import { connectMidnightLocalWallet } from "./midnight-wallet.ts";

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

// Throttle on the wallet state observable, applied before the isSynced filter.
// Keep short in-browser — large values delay connect even on already-synced chains.
const WALLET_SYNC_THROTTLE_MS = 250;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

// ============================================================================
// Types
// ============================================================================

// Inlined common types for standalone script
type CounterCircuits = ImpureCircuitId<Counter.Contract<CounterPrivateState>>;

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
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

function createTtl(): Date {
  return new Date(Date.now() + TTL_DURATION_MS);
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
    const txId = await walletResult.wallet.submitTransaction(await walletResult.wallet.finalizeTransaction(recipe));
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


function createWalletAndMidnightProvider(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  walletZswapSecretKeys: ZswapSecretKeys,
  dustSecretKey: DustSecretKey,
  walletDustSecretKey: DustSecretKey,
  unshieldedKeystore: UnshieldedKeystore,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return zswapSecretKeys.encryptionPublicKey;
    },
    async balanceTx(
      tx: UnboundTransaction,
      ttl?: Date
    ): Promise<FinalizedTransaction> {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletZswapSecretKeys, dustSecretKey: walletDustSecretKey },
        { ttl: ttl ?? createTtl() },
      );
      const signed = await wallet.signRecipe(recipe, (payload) => unshieldedKeystore.signDataAsync(payload));
      return wallet.finalizeRecipe(signed);
    },
    submitTx(tx: FinalizedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
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
      ? Counter.ledger(contractState.data).round
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
    compiledContract: compiledContract as any,
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
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.walletZswapSecretKeys,
    walletResult.dustSecretKey,
    walletResult.walletDustSecretKey,
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

  const zkConfigProvider = new FetchZkConfigProvider(
    zkConfigPath,
    fetch.bind(window),
  );
  const proofProvider = httpClientProofProvider(config.proofServer, zkConfigProvider);

  const providers: CounterProviders = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
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
let globalProviders: CounterProviders | null = null;
let globalCounterContract: DeployedCounterContract | null = null;

const connectMidnightWallet = async (): Promise<{
  wallet: WalletFacade;
  providers: CounterProviders;
}> => {
  const connected = await connectMidnightLocalWallet({
    sync: syncAndWaitForFunds,
    configure: configureProviders,
  });
  globalProviders = connected.providers;
  return connected;
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
