import * as log from "@std/log";
import {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  type DeployedContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import {
  type BalancedProvingRecipe,
  type MidnightProvider,
  type MidnightProviders,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { dirname, resolve } from "@std/path";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  InMemoryTransactionHistoryStorage,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  LedgerParameters,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
} from "@midnight-ntwrk/ledger-v6";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";
import {
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
  type TransactionId,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v6";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

globalThis.WebSocket = WebSocket;

// Inlined common types for standalone script
type SimpleTokenCircuits = any;

const SimpleTokenPrivateStateId = "simpleTokenPrivateState";

type SimpleTokenProviders = MidnightProviders<
  SimpleTokenCircuits,
  typeof SimpleTokenPrivateStateId,
  any
>;

type SimpleTokenContract = SimpleToken.Contract;

type DeployedSimpleTokenContract =
  | DeployedContract<any>
  | FoundContract<any>;

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

/** Additional fee overhead for dust transactions (in smallest unit) */
const DUST_FEE_OVERHEAD = 300_000_000_000_000n;

/** Fee blocks margin for dust wallet */
const DUST_FEE_BLOCKS_MARGIN = 5;

/** Wallet sync progress logging throttle interval */
const WALLET_SYNC_THROTTLE_MS = 10_000;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000001";

const simpleTokenContractInstance: SimpleTokenContract = new SimpleToken
  .Contract(
  witnesses,
);

// ============================================================================
// Types
// ============================================================================

export interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  walletDustSecretKey: DustSecretKey;
  dustAddress: string;
  unshieldedAddress: string;
  unshieldedKeystore: UnshieldedKeystore;  // Needed for signing unshielded transactions
}

export type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

export interface ShieldedWalletState {
  address: {
    coinPublicKeyString(): string;
    encryptionPublicKeyString(): string;
  };
  balances: Record<string, bigint>;
}

// ============================================================================
// Key Derivation
// ============================================================================

export function deriveSeedForRole(seed: string, role: DerivationRole): Uint8Array {
  const seedBuffer = Buffer.from(seed, "hex");
  const hdWalletResult = HDWallet.fromSeed(seedBuffer);

  if (hdWalletResult.type !== "seedOk") {
    throw new Error(`Failed to create HD wallet: ${hdWalletResult.type}`);
  }

  const derivationResult = hdWalletResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);

  if (derivationResult.type === "keyOutOfBounds") {
    throw new Error(`Key derivation out of bounds for role: ${role}`);
  }

  return Buffer.from(derivationResult.key);
}

// ============================================================================
// Wallet Configuration
// ============================================================================

export function createWalletConfiguration(
  networkUrls: Required<Omit<Config, "constructor">>,
  networkId: NetworkId.NetworkId
): DefaultV1Configuration {
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: networkId,
  };
}

export function buildShieldedWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array
): ReturnType<ReturnType<typeof ShieldedWallet>["startWithShieldedSeed"]> {
  const shieldedBuilder = ShieldedWallet(config);
  return shieldedBuilder.startWithShieldedSeed(seed);
}

export function buildDustWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array
): ReturnType<ReturnType<typeof DustWallet>["startWithSeed"]> {
  const legacyLedgerParams = LedgerParameters.initialParameters();
  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: legacyLedgerParams as unknown as LedgerParameters,
      additionalFeeOverhead: DUST_FEE_OVERHEAD,
      feeBlocksMargin: DUST_FEE_BLOCKS_MARGIN,
    },
  };
  const dustBuilder = DustWallet(dustConfig);
  const dustParameters = legacyLedgerParams.dust;

  return dustBuilder.startWithSeed(seed, dustParameters);
}

export function buildUnshieldedWallet(
  networkUrls: Required<Omit<Config, "constructor">>,
  seed: Uint8Array,
  networkId: NetworkId.NetworkId
): ReturnType<ReturnType<typeof UnshieldedWallet>["startWithPublicKey"]> {
  const keystore = createKeystore(seed, networkId);
  const publicKey = PublicKey.fromKeyStore(keystore);

  return UnshieldedWallet({
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  } as any).startWithPublicKey(publicKey);
}

export async function buildWalletFacade(
  networkUrls: Required<Omit<Config, "constructor">>,
  seed: string,
  networkId: NetworkId.NetworkId
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const walletConfig = createWalletConfiguration(networkUrls, networkId);

  const shieldedWallet = buildShieldedWallet(walletConfig, shieldedSeed);
  const dustWallet = buildDustWallet(walletConfig, dustSeed);
  const unshieldedWallet = buildUnshieldedWallet(networkUrls, unshieldedSeed, networkId);

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  const wallet = new WalletFacade(shieldedWallet as any, unshieldedWallet as any, dustWallet);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const walletZswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const walletDustSecretKey = DustSecretKey.fromSeed(dustSeed);

  await wallet.start(walletZswapSecretKeys, walletDustSecretKey);

  const dustState = await Rx.firstValueFrom(dustWallet.state) as any;

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey,
    dustAddress: dustState.dustAddress,
    unshieldedAddress,
    unshieldedKeystore,  // Return keystore for signing operations
  };
}

export function getInitialShieldedState(
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean; logLabel?: string }
): Promise<{ shieldedBalance: bigint; dustBalance: bigint }> {
  const logPrefix = options?.logLabel ? `[${options.logLabel}] ` : "";
  log.info(`${logPrefix}Waiting for wallet to sync and receive funds (shielded/dust)...`);

  const syncTimeoutMs = options?.timeoutMs ?? WALLET_SYNC_TIMEOUT_MS;
  const waitNonZero = options?.waitNonZero ?? false;
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced =
      latestState.shielded.state.progress.isStrictlyComplete() ||
      (latestState.isSynced ?? false);
    const dustSynced =
      latestState.dust.state.progress.isStrictlyComplete() ||
      (latestState.isSynced ?? false);
    const unshieldedSynced =
      latestState.unshielded?.syncProgress?.synced ??
      (latestState.isSynced ?? false);
    log.info(
      `${logPrefix}[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
  }, WALLET_SYNC_THROTTLE_MS);

  let state: any;
  try {
    state = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
        Rx.tap((state: any) => {
          latestState = state;
          const isSynced = state.isSynced ?? false;
          const shieldedSynced =
            state.shielded.state.progress.isStrictlyComplete() || isSynced;
          const dustSynced =
            state.dust.state.progress.isStrictlyComplete() || isSynced;
          const unshieldedSynced =
            state.unshielded?.syncProgress?.synced ?? isSynced;
          log.info(
            `${logPrefix}Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`
          );
        }),
        Rx.filter((state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedSynced =
            state.shielded.state.progress.isStrictlyComplete() || isSynced;
          const dustSynced =
            state.dust.state.progress.isStrictlyComplete() || isSynced;
          const unshieldedSynced =
            state.unshielded?.syncProgress?.synced ?? isSynced;

          if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

          if (waitNonZero) {
            const shieldedBalance = state.shielded.balances[shieldedToken().raw] ?? 0n;
            return shieldedBalance > 0n;
          }

          return true;
        }),
        Rx.tap(() => log.info(`${logPrefix}Wallet sync complete`)),
        Rx.timeout({
          each: syncTimeoutMs,
          with: () =>
            Rx.throwError(
              () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`)
            ),
        })
      )
    );
  } finally {
    clearInterval(periodicLogger);
  }

  const shieldedBalance = (state as any).shielded.balances[shieldedToken().raw] ?? 0n;

  const dustBalance = await waitForDustFunds(wallet, {
    timeoutMs: syncTimeoutMs,
    waitNonZero,
  });

  return { shieldedBalance, dustBalance };
}

export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean }
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options =
    typeof optionsOrTimeout === "number"
      ? { timeoutMs: optionsOrTimeout }
      : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? WALLET_SYNC_TIMEOUT_MS;
  const waitNonZero = options?.waitNonZero ?? false;

  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    dustWallet.state.pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        try {
          const progress = (state as any).state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          log.info(`Dust wallet sync progress: complete=${complete ?? "unknown"}`);
        } catch (_err) {
        }
      }),
      Rx.filter((state: any) => {
        try {
          const progress = (state as any).state?.progress;
          return progress?.isCompleteWithin?.(0n) === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: any) => {
        try {
          if (typeof state.walletBalance === "function") {
            return state.walletBalance(new Date());
          }
          const balances = state.balances;
          if (balances) {
            return Object.values(balances).reduce(
              (acc: bigint, v) => acc + BigInt((v as any) ?? 0),
              0n
            );
          }
        } catch (_err) {
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
        if (balance > 0n) log.info(`Dust wallet balance: ${balance}`);
      })
    )
  )) as bigint;

  return dustBalance;
}

// ============================================================================
// Configuration
// ============================================================================

class StandaloneConfig implements Config {
  indexer = "http://127.0.0.1:8088/api/v3/graphql";
  indexerWS = "ws://127.0.0.1:8088/api/v3/graphql/ws";
  node = "http://127.0.0.1:9944";
  proofServer = "http://127.0.0.1:6300";
  constructor() {
    setNetworkId(NetworkId.NetworkId.Undeployed);
  }
}

const config = new StandaloneConfig();

const currentDir = resolve(
  dirname(new URL(import.meta.url).pathname),
);

const contractConfig = {
  privateStateStoreName: "unshielded-erc20-private-state",
  zkConfigPath: resolve(
    currentDir,
    "unshielded-erc20",
    "src",
    "managed",
    "unshielded-erc20",
  ),
};

// ============================================================================
// Contract Functions
// ============================================================================

const joinContract = async (
  providers: SimpleTokenProviders,
  contractAddress: string,
): Promise<DeployedSimpleTokenContract> => {
  console.log("Joining contract...🍋🍋🍋");
  const simpleTokenContract = await findDeployedContract(providers, {
    contractAddress,
    contract: simpleTokenContractInstance as any,
    privateStateId: "simpleTokenPrivateState",
    initialPrivateState: {},
  });
  console.log(
    `Joined contract at address: ${simpleTokenContract.deployTxData.public.contractAddress}`,
  );
  return simpleTokenContract;
};

const wrapAddress = (address: string): any => {
  const shieldedAddress = ShieldedAddress.codec.decode(
    "undeployed",
    MidnightBech32m.parse(address),
  );

  return {
    is_left: true,
    left: { bytes: shieldedAddress.coinPublicKey.data },
    right: { bytes: new Uint8Array(32) },
  };
};

const mint = async (
  simpleTokenContract: DeployedSimpleTokenContract,
  account: string,
  value: bigint,
): Promise<any> => {
  console.log(`Minting ${value} tokens to ${account}...`);

  const either = wrapAddress(account);
  const finalizedTxData = await (simpleTokenContract.callTx as any).mint(either, value);
  console.log(
     `Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`,
  );
  console.log( `Minted ${value} tokens to ${account}`);
  return finalizedTxData.public;
};

// ============================================================================
// Provider Functions
// ============================================================================

/**
 * Create wallet and midnight provider adapter for WalletFacade
 *
 * Implements the WalletProvider and MidnightProvider interfaces
 * as defined in @midnight-ntwrk/midnight-js-types v3.x
 */
function createWalletAndMidnightProvider(
  wallet: WalletFacade,
  zswapSecretKeys: ZswapSecretKeys,
  walletZswapSecretKeys: ZswapSecretKeys,
  dustSecretKey: DustSecretKey,
  walletDustSecretKey: DustSecretKey
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey(): CoinPublicKey {
      return zswapSecretKeys.coinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return zswapSecretKeys.encryptionPublicKey;
    },
    async balanceTx(
      tx: UnprovenTransaction,
      _newCoins?: any[],
      ttl?: Date
    ): Promise<BalancedProvingRecipe> {
      return wallet.balanceTransaction(
        walletZswapSecretKeys,
        walletDustSecretKey,
        tx as any,
        ttl ?? new Date(Date.now() + TTL_DURATION_MS)
      );
    },
    submitTx(tx: any): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
}

const configureProviders = async (
  wallet: WalletFacade,
  walletZswapSecretKeys: ZswapSecretKeys,
  walletDustSecretKey: DustSecretKey,
  config: Config,
) => {
  const walletAndMidnightProvider = createWalletAndMidnightProvider(
    wallet,
    walletZswapSecretKeys,
    walletZswapSecretKeys,
    walletDustSecretKey,
    walletDustSecretKey
  );
  return {
    privateStateProvider: levelPrivateStateProvider<
      typeof SimpleTokenPrivateStateId
    >({
      privateStateStoreName: contractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    } as any),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider: new NodeZkConfigProvider<"mint">(
      contractConfig.zkConfigPath,
    ),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

const getContractAddress = async (): Promise<string> => {
  const contractAddressFile = resolve(currentDir, "unshielded-erc20.undeployed.json");

  try {
      const contractAddressFromFile = JSON.parse(
        await Deno.readTextFile(contractAddressFile),
      ).contractAddress;

        console.log(
          `📄 Using contract address from file ${contractAddressFile}: ${contractAddressFromFile}`,
        );
        return contractAddressFromFile;

  } catch (error) {
    console.error(`❌ Error reading contract address from file: ${error}`);
    console.error("❌ Error: Contract address is required");
    console.error(
      "Usage: deno run --allow-all increment.ts <CONTRACT_ADDRESS>",
    );
    console.error(
      "Or create a contract_address.txt file with the contract address",
    );
    console.error(
      "Example: deno run --allow-all increment.ts 0x1234567890abcdef1234567890abcdef12345678",
    );
    throw error;
  }
};

// ============================================================================
// Main Function
// ============================================================================

async function joinAndMint(accounts: string | string[], amount: bigint): Promise<boolean> {

  const targets = Array.isArray(accounts) ? accounts : [accounts];
  const networkUrls = {
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    proofServer: config.proofServer,
  };

  let wallet: WalletFacade | null = null;

  try {
      // Get contract address from command line arguments or file
  const contractAddress = await getContractAddress();

  console.log(
    `🚀 Starting join and mint process for contract: ${contractAddress}`,
  );

    console.log("🔗 Building wallet with genesis seed for standalone mode...");

    // Build wallet using genesis seed (which has initial funds in standalone mode)
    const walletResult = await buildWalletFacade(
      networkUrls,
      GENESIS_MINT_WALLET_SEED,
      NetworkId.NetworkId.Undeployed,
    );
    wallet = walletResult.wallet;
    console.log("✅ Wallet built successfully");

    const initialState = await getInitialShieldedState(wallet.shielded);
    console.log(`Your master wallet seed is: ${GENESIS_MINT_WALLET_SEED}`);
    console.log(`Your master wallet address is: ${initialState.address.coinPublicKeyString()}`);

    const { shieldedBalance, dustBalance } = await syncAndWaitForFunds(wallet, {
      waitNonZero: true,
      logLabel: "mint",
    });
    console.log(`Shielded balance: ${shieldedBalance}`);
    console.log(`Dust balance: ${dustBalance}`);

    console.log("✅ Wallet built successfully");

    // Configure providers
    console.log("⚙️ Configuring providers...");
    const providers = await configureProviders(
      wallet,
      walletResult.walletZswapSecretKeys,
      walletResult.walletDustSecretKey,
      config,
    );

    console.log("✅ Providers configured successfully");

    // Join the contract
    console.log(
      `🔗 Joining simple token contract at address: ${contractAddress}`,
    );
    const simpleTokenContract = await joinContract(providers, contractAddress);

    console.log("✅ Successfully joined the simple token contract");

    // Increment the counter
    console.log("🔢 Minting simple token...");
    let i = 1;
    for (const account of targets) {
      console.log(`🧾 Mint tx [${i} of ${targets.length}] starting for ${account}`);
      const mintResult = await mint(simpleTokenContract, account, amount);
      console.log(
        `✅ Simple token minted [${i} of ${targets.length}] txId=${mintResult.txId} block=${mintResult.blockHeight} account=${account}`
      );
      i += 1;
    }
    console.log("🎉 Mint process completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Error during join and mint process (0x1)", error);
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    if (wallet) {
      try {
        await wallet.stop();
        console.log("🧹 Wallet closed successfully");
      } catch (error) {
        console.error("❌ Error closing wallet:", error);
      }
    }
  }
}

// Run the script if this file is executed directly
if (import.meta.main) {
  await log.setup({
    handlers: {
      console: new log.ConsoleHandler("INFO"),
    },
    loggers: {
      default: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  });

  const address = "mn_shield-addr_undeployed1zl9wafu8ad4nfm7jmrh8gukfnu3l5smn4rhglxqh6ayvf4f4vzasxqzn5va92vps2xxpdgy856z6cpzrllj3n35k5r3trp0unzskh9lwsvdzgnft";
  joinAndMint(address, 250000000000n).catch((error) => {
    console.error("❌ Unhandled error:", error);
    Deno.exit(1);
  });
}

export { joinAndMint };
