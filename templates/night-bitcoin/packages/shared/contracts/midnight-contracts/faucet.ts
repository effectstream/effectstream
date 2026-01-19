import * as log from "@std/log";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
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
  nativeToken,
} from "@midnight-ntwrk/ledger-v6";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts
 *
 */

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
  "0000000000000000000000000000000000000000000000000000000000000000001";

// ============================================================================
// Types
// ============================================================================

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

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

// ============================================================================
// Key Derivation
// ============================================================================

export type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

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

/**
 * Create wallet configuration for the modular Midnight SDK
 */
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

/**
 * Build a complete wallet facade with shielded, unshielded, and dust wallets
 */
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
    unshieldedKeystore,
  };
}

export interface ShieldedWalletState {
  address: {
    coinPublicKeyString(): string;
    encryptionPublicKeyString(): string;
  };
  balances: Record<string, bigint>;
}

export function getInitialShieldedState(
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Wait for wallet to be synced and funded
 */
export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean }
): Promise<{ shieldedBalance: bigint; dustBalance: bigint }> {
  log.info("Waiting for wallet to sync and receive funds (shielded/dust)...");

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
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
  }, WALLET_SYNC_THROTTLE_MS);

  const state = await Rx.firstValueFrom(
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
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`
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
          const shieldedBalance = state.shielded.balances[shieldedToken().tag] ?? 0n;
          return shieldedBalance > 0n;
        }

        return true;
      }),
      Rx.tap(() => log.info("Wallet sync complete")),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      })
    )
  );

  clearInterval(periodicLogger);

  const shieldedBalance = (state as any).shielded.balances[shieldedToken().tag] ?? 0n;

  const dustBalance = await waitForDustFunds(wallet, {
    timeoutMs: syncTimeoutMs,
    waitNonZero,
  });

  return { shieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
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

const waitForFunds = async (wallet: WalletFacade) => {
  const { shieldedBalance, dustBalance } = await syncAndWaitForFunds(wallet, {
    waitNonZero: true,
  });
  return dustBalance;
};

const buildWalletAndWaitForFunds = async (
  networkUrls: Required<Omit<Config, "constructor">>,
  seed: string
): Promise<WalletFacade> => {
  const walletResult = await buildWalletFacade(
    networkUrls,
    seed,
    NetworkId.NetworkId.Undeployed
  );
  console.log("✅ Wallet built successfully");
  const initialState = await getInitialShieldedState(walletResult.wallet.shielded);
  console.log(`Your wallet seed is: ${seed}`);
  console.log(`Your wallet address is: ${initialState.address.coinPublicKeyString()}`);
  console.log(`Your dust address is: ${walletResult.dustAddress}`);
  let balance = await waitForFunds(walletResult.wallet);
  console.log(`Your wallet balance is: ${balance}`);
  return walletResult.wallet;
};

const transfer = async (
  walletResult: WalletResult,
  receiverAddress: string,
  amount: bigint = 10000000n
): Promise<void> => {
  console.log(`Transferring ${amount} to ${receiverAddress}`);

  try {
    const unprovenTx = await (walletResult.wallet as any).createTransferTransaction(
      [receiverAddress],
      [{ amount, type: nativeToken() }],
      walletResult.walletZswapSecretKeys,
      walletResult.walletDustSecretKey,
      new Date(Date.now() + TTL_DURATION_MS)
    );
    console.log("✓ Transfer transaction created");

    const recipe = await walletResult.wallet.balanceTransaction(
      walletResult.walletZswapSecretKeys,
      walletResult.walletDustSecretKey,
      unprovenTx,
      new Date(Date.now() + TTL_DURATION_MS)
    );
    console.log("✓ Transfer transaction balanced");

    const finalizedTx = await walletResult.wallet.finalizeTransaction(recipe);
    console.log("✓ Transfer transaction finalized");

    const txId = await walletResult.wallet.submitTransaction(finalizedTx);
    console.log({ txId });
    console.log(`✅ Successfully transferred dust to ${receiverAddress}`);
  } catch (error) {
    console.error("❌ Error during transfer:", error);
    throw error;
  }
};

export const faucet = async (
  receiverAddresses: string | string[],
  seed: string = GENESIS_MINT_WALLET_SEED
): Promise<void> => {
  let wallet: WalletFacade | null = null;

  const targets = Array.isArray(receiverAddresses)
    ? receiverAddresses
    : [receiverAddresses];
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const networkUrls = {
        indexer: config.indexer,
        indexerWS: config.indexerWS,
        node: config.node,
        proofServer: config.proofServer,
      };

      console.log(
        `🔗 Building wallet with genesis seed for standalone mode... (attempt ${attempt})`
      );

      const walletResult = await buildWalletFacade(
        networkUrls,
        seed,
        NetworkId.NetworkId.Undeployed
      );
      wallet = walletResult.wallet;
      console.log("✅ Wallet built successfully");

      const initialState = await getInitialShieldedState(wallet.shielded);
      console.log(`Wallet address: ${initialState.address.coinPublicKeyString()}`);
      console.log(`Dust address: ${walletResult.dustAddress}`);

      const { shieldedBalance, dustBalance } = await syncAndWaitForFunds(wallet, {
        waitNonZero: true,
      });
      console.log(`Shielded balance: ${shieldedBalance}`);
      console.log(`Dust balance: ${dustBalance}`);

      let i = 1;
      while (targets.length > 0) {
        const receiverAddress = targets[0];
        await transfer(walletResult, receiverAddress, 10000000n);
        targets.splice(targets.indexOf(receiverAddress), 1);
        console.log(
          `✅ Successfully transferred dust to [${i} of ${targets.length}] (attempt ${attempt}) ${receiverAddress}`
        );
        i += 1;
      }
      console.log("✅ Successfully transferred dust to all wallets");
      break;
    } catch (error) {
      console.error("❌ Error during join and mint process (0x2)", error);
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : error
      );
    }
  }

  if (wallet) {
    try {
      await wallet.stop();
      console.log("🧹 Wallet closed successfully");
    } catch (error) {
      console.error("❌ Error closing wallet:", error);
    }
  }
};

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

  const midnightAddress = Deno.env.get("MIDNIGHT_ADDRESS");
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error(
      "Example: MIDNIGHT_ADDRESS=mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts"
    );
    Deno.exit(1);
  }
  try {
    await faucet(midnightAddress);
    Deno.exit(0);
  } catch (error) {
    console.error("❌ Error during faucet process:", error);
    Deno.exit(1);
  }
}
