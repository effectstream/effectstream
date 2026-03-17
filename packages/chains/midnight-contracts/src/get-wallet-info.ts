import dotenv from "dotenv";
import { parseArgs } from "node:util";

const log = console;
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
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  LedgerParameters,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v7";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";
import { CONSTANTS } from "./constants.ts";
import type { NetworkUrls, WalletResult } from "./types.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";
import { getEnv, args as getArgs, exit, isNotFoundError } from "@effectstream/utils/runtime";

// ============================================================================
// Key Derivation
// ============================================================================

export type DerivationRole =
  | typeof Roles.Zswap
  | typeof Roles.Dust
  | typeof Roles.NightExternal;

export function deriveSeedForRole(
  seed: string,
  role: DerivationRole,
): Uint8Array {
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
 * Resolve sync timeout from env or default.
 */
export function resolveWalletSyncTimeoutMs(): number {
  const envValue = getEnv("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return CONSTANTS.WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${CONSTANTS.WALLET_SYNC_TIMEOUT_MS}ms`,
  );
  return CONSTANTS.WALLET_SYNC_TIMEOUT_MS;
}

/**
 * Safely stringify progress objects that may contain bigint.
 */
export function safeStringifyProgress(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  } catch (_err) {
    return String(value);
  }
}

/**
 * Wait for wallet to be synced and funded
 */
export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean },
): Promise<{
  shieldedBalance: bigint;
  unshieldedBalance: bigint;
  dustBalance: bigint;
}> {
  log.info(
    "Waiting for wallet to sync and receive funds (shielded/unshielded/dust)...",
  );

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
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
      latestState.isSynced ??
      false;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`,
    );
  }, CONSTANTS.WALLET_SYNC_THROTTLE_MS);

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
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
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`,
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
          const tokenObj = shieldedToken();
          const tokenId = tokenObj.raw;
          const shieldedBalance = state.shielded.balances[tokenId] ?? 0n;
          return shieldedBalance > 0n;
        }

        return true;
      }),
      Rx.tap(() => log.info("Wallet sync complete")),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`),
          ),
      }),
    ),
  );

  clearInterval(periodicLogger);

  // Get the actual token identifier - use the .raw property which is the hex string
  const tokenObj = shieldedToken();
  const tokenId = tokenObj.raw;

  // Log all available balances for debugging
  const shieldedBalancesObj = state.shielded.balances || {};
  const availableKeys = Object.keys(shieldedBalancesObj);
  log.info(
    `Available shielded balance keys: ${availableKeys.length > 0 ? availableKeys.join(", ") : "none"}`,
  );

  log.info(`Looking for token ID: ${tokenId}`);

  const shieldedBalance = shieldedBalancesObj[tokenId] ?? 0n;
  console.log("All shielded balances", shieldedBalancesObj);
  log.info(`Shielded balance for token ${tokenId}: ${shieldedBalance}`);

  // Handle unshielded balances - could be Map or Record
  const unshieldedBalances =
    // deno-lint-ignore no-explicit-any
    (state as any).unshielded?.balances as
      | Map<string, bigint>
      | Record<string, bigint>
      | undefined;

  let unshieldedBalance = 0n;
  if (unshieldedBalances) {
    if (unshieldedBalances instanceof Map) {
      unshieldedBalance = Array.from(unshieldedBalances.values()).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n,
      );
    } else {
      unshieldedBalance = Object.values(unshieldedBalances).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n,
      );
    }
  }

  // Try to resolve dust balance; if unavailable or times out, return 0n
  let dustBalance = 0n;
  try {
    dustBalance = await waitForDustFunds(wallet, {
      timeoutMs: syncTimeoutMs,
      waitNonZero,
    });
  } catch (_err) {
    log.warn(
      "Dust wallet did not report funds within timeout; continuing with dustBalance=0",
    );
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean },
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options =
    typeof optionsOrTimeout === "number"
      ? { timeoutMs: optionsOrTimeout }
      : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;

  // deno-lint-ignore no-explicit-any
  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    dustWallet.state.pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        try {
          const progress = state.state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          log.info(
            `Dust wallet sync progress: complete=${complete ?? "unknown"}`,
          );
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
              0n,
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
            () =>
              new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`),
          ),
      }),
      Rx.filter((balance: bigint) => !waitNonZero || balance > 0n),
      Rx.tap((balance: bigint) => {
        if (balance > 0n) log.info(`Dust wallet balance: ${balance}`);
      }),
    ),
  )) as bigint;

  return dustBalance;
}

export function getInitialDustState(
  // deno-lint-ignore no-explicit-any
  dustWallet: any,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  return Rx.firstValueFrom(dustWallet.state);
}

/**
 * Create wallet configuration for the modular Midnight SDK
 * Accepts NetworkId enum values directly without normalization
 */
function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>,
  networkId: NetworkId.NetworkId,
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

function buildShieldedWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array,
): ReturnType<ReturnType<typeof ShieldedWallet>["startWithShieldedSeed"]> {
  const shieldedBuilder = ShieldedWallet(config);
  return shieldedBuilder.startWithShieldedSeed(seed);
}

function buildDustWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array,
): ReturnType<ReturnType<typeof DustWallet>["startWithSeed"]> {
  const legacyLedgerParams = LedgerParameters.initialParameters();
  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: legacyLedgerParams as unknown as LedgerParameters,
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
  const dustBuilder = DustWallet(dustConfig);
  const dustParameters = legacyLedgerParams.dust;

  return dustBuilder.startWithSeed(seed, dustParameters);
}

function buildUnshieldedWallet(
  networkUrls: Required<NetworkUrls>,
  seed: Uint8Array,
  networkId: NetworkId.NetworkId,
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
 * Accepts NetworkId enum values directly
 */
export async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls, networkId);

  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);
  const dustWallet = buildDustWallet(config, dustSeed);
  const unshieldedWallet = buildUnshieldedWallet(
    networkUrls,
    unshieldedSeed,
    networkId,
  );

  // Derive unshielded address directly from seed
  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  // deno-lint-ignore no-explicit-any
  const wallet = new WalletFacade(
    shieldedWallet as any,
    unshieldedWallet as any,
    dustWallet as any,
  );

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const walletZswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const walletDustSecretKey = DustSecretKey.fromSeed(dustSeed);

  await wallet.start(walletZswapSecretKeys, walletDustSecretKey);

  const dustState = await getInitialDustState(wallet.dust);

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

interface ShieldedWalletState {
  address: {
    coinPublicKeyString(): string;
    encryptionPublicKeyString(): string;
  };
  balances: Record<string, bigint>;
}

export function getInitialShieldedState(
  // deno-lint-ignore no-explicit-any
  shieldedWallet: any,
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Get initial state of unshielded wallet
 */
function getInitialUnshieldedState(
  // deno-lint-ignore no-explicit-any
  unshieldedWallet: any,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  if (!unshieldedWallet) return Promise.resolve(null);
  if (
    unshieldedWallet.state &&
    typeof unshieldedWallet.state.pipe === "function"
  ) {
    return Rx.firstValueFrom(unshieldedWallet.state);
  }
  if (typeof unshieldedWallet.state === "function") {
    return Rx.firstValueFrom(unshieldedWallet.state());
  }
  return Promise.resolve(null);
}

/**
 * Register unshielded Night UTXOs for dust generation
 * This is required before the wallet can pay transaction fees
 */
export async function registerNightForDust(
  walletResult: WalletResult,
): Promise<boolean> {
  log.info(
    "Checking for unshielded Night UTXOs to register for dust generation...",
  );

  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(Rx.filter((s: any) => s.isSynced)),
  );

  // Check if we have unshielded coins that are not registered for dust generation
  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter(
      (coin: any) => coin.meta.registeredForDustGeneration === false,
    ) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    log.info("No unregistered unshielded Night UTXOs available.");
    // Check current dust balance
    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: 5000,
    });
    return dustBalance > 0n;
  }

  log.info(
    `Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`,
  );

  try {
    const recipe =
      await walletResult.wallet.registerNightUtxosForDustGeneration(
        unregisteredNightUtxos,
        walletResult.unshieldedKeystore.getPublicKey(),
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );

    const signedRecipe: UnprovenTransaction =
      await walletResult.wallet.signUnprovenTransaction(
        recipe.transaction,
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );

    log.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await walletResult.wallet.finalizeTransaction(signedRecipe),
    );
    log.info(`Dust registration submitted with tx id: ${txId}`);

    // Wait for dust to be available
    log.info("Waiting for dust to be generated...");
    await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const dustBalance = s.dust?.walletBalance?.(new Date()) ?? 0n;
          log.info(`Current dust balance: ${dustBalance}`);
        }),
        Rx.filter((s: any) => (s.dust?.walletBalance?.(new Date()) ?? 0n) > 0n),
        Rx.timeout({
          each: resolveWalletSyncTimeoutMs(),
          with: () =>
            Rx.throwError(
              () => new Error("Timeout waiting for dust generation"),
            ),
        }),
      ),
    );

    log.info("Dust registration complete!");
    return true;
  } catch (e) {
    log.error(
      `Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Parse command-line arguments
  const { values: parsedArgs } = parseArgs({
    args: getArgs(),
    options: {
      seed: { type: "string" },
      balance: { type: "boolean", default: false },
    },
    strict: false,
  });

  // Load .env.testnet if it exists
  const result = dotenv.config({ path: ".env.testnet", override: true });
  if (result.error) {
    if (!isNotFoundError(result.error)) {
      log.warn(`Failed to load .env.testnet: ${result.error}`);
    }
  }

  const envSeed = getEnv("MIDNIGHT_WALLET_SEED");
  const argSeed = parsedArgs.seed;
  let seed = argSeed || envSeed;

  if (!seed) {
    log.info("No seed provided. Generating a new random 32-byte hex seed...");
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    seed = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    log.info("==========================================");
    log.info(`GENERATED SEED: ${seed}`);
    log.info("SAVE THIS SEED! YOU WILL NEED IT TO RESTORE THIS WALLET.");
    log.info("==========================================");
  } else {
    log.info("Using provided seed: " + seed);
  }

  // Note about genesis seeds
  if (
    seed?.startsWith(
      "000000000000000000000000000000000000000000000000000000000000000",
    )
  ) {
    log.warn(
      "⚠️  Genesis seeds (0x000...001, 0x000...002, etc.) only have funds on 'undeployed' local networks!",
    );
    log.warn("⚠️  For testnet/preview networks, you need to:");
    log.warn("   1. Generate a new wallet seed, OR");
    log.warn("   2. Request funds from a faucet for this wallet");
  }

  // Network Configuration
  const indexer =
    getEnv("MIDNIGHT_INDEXER_URL") || midnightNetworkConfig.indexer;
  const indexerWS =
    getEnv("MIDNIGHT_INDEXER_WS_URL") || midnightNetworkConfig.indexerWS;
  const node = getEnv("MIDNIGHT_NODE_URL") || midnightNetworkConfig.node;
  const proofServer =
    getEnv("MIDNIGHT_PROOF_SERVER_URL") || midnightNetworkConfig.proofServer;

  const networkUrls: Required<NetworkUrls> = {
    id: "placeholder-value",
    indexer,
    indexerWS,
    node,
    proofServer,
  };

  const networkIdRaw = getEnv("MIDNIGHT_NETWORK_ID") || "undeployed";

  // Map common network names to NetworkId enum values
  // Based on midnight-js testkit examples and Lace wallet compatibility
  let networkId: NetworkId.NetworkId;
  switch (networkIdRaw.toLowerCase()) {
    case "undeployed":
      networkId = NetworkId.NetworkId.Undeployed;
      break;
    case "testnet":
    case "testnet-02":
      networkId = NetworkId.NetworkId.TestNet;
      break;
    case "devnet":
    case "qanet":
      networkId = NetworkId.NetworkId.DevNet;
      break;
    case "preview":
      // Preview network uses its own NetworkId (confirmed by Lace wallet addresses)
      networkId = "preview" as NetworkId.NetworkId;
      log.info(
        `Using preview network (addresses will have mn_addr_preview prefix)`,
      );
      break;
    default:
      log.warn(
        `Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`,
      );
      networkId = networkIdRaw as NetworkId.NetworkId;
  }
  networkUrls.id = networkId;

  log.info(`Using network ID: ${networkId}`);
  log.info(`Indexer: ${indexer}`);
  log.info(`Indexer WS: ${indexerWS}`);
  log.info(`Node: ${node}`);
  setNetworkId(networkId);

  try {
    log.info("Building wallet...");
    const walletResult = await buildWalletFacade(networkUrls, seed, networkId);

    const initialState = await getInitialShieldedState(
      walletResult.wallet.shielded,
    );
    const shieldedAddress = initialState.address.coinPublicKeyString();

    log.info("==========================================");
    log.info("Wallet Addresses");
    log.info("==========================================");
    log.info(`Shielded Address:   ${shieldedAddress}`);
    log.info(`Unshielded Address: ${walletResult.unshieldedAddress}`);
    log.info(`Dust Address:       ${walletResult.dustAddress}`);
    log.info("==========================================");

    // Only fetch balances if --balance flag is provided
    if (parsedArgs.balance) {
      log.info("==========================================");
      log.info("Fetching Balances...");
      log.info("==========================================");

      let shieldedBalance = 0n;
      let unshieldedBalance = 0n;
      let dustBalance = 0n;

      // 1. Get initial shielded balance
      const tokenObj = shieldedToken();
      const tokenId = tokenObj.raw;
      shieldedBalance = initialState.balances[tokenId] ?? 0n;

      // 2. If balance is 0, let's wait for sync to be sure
      const syncTimeoutMs = resolveWalletSyncTimeoutMs();

      if (shieldedBalance === 0n) {
        log.info(
          "Shielded balance is 0. Waiting for wallet sync to confirm funds...",
        );
        try {
          const synced = await syncAndWaitForFunds(walletResult.wallet);
          shieldedBalance = synced.shieldedBalance;
          unshieldedBalance = synced.unshieldedBalance;
        } catch (e) {
          log.warn(
            `Sync timed out or failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          // fall back to what we have
        }
      } else {
        // If we have shielded balance, we should still check unshielded state manually
        try {
          // deno-lint-ignore no-explicit-any
          const unshieldedState = await getInitialUnshieldedState(
            (walletResult.wallet as any).unshielded,
          );
          // deno-lint-ignore no-explicit-any
          const uBalances = unshieldedState?.balances;
          if (uBalances) {
            // Handle both Map and Record types
            const balancesArray =
              uBalances instanceof Map
                ? Array.from(uBalances.values())
                : Object.values(uBalances);
            unshieldedBalance = balancesArray.reduce(
              (acc: bigint, v) => acc + BigInt((v as any) ?? 0),
              0n,
            );
          }
        } catch (_e) {
          /* ignore */
        }
      }

      // 3. Check Dust balance
      try {
        // Get initial dust balance from state
        const state = await Rx.firstValueFrom(walletResult.wallet.state());
        const dBalances = (state as any).dust?.balances;
        if (dBalances) {
          dustBalance = Object.values(dBalances).reduce(
            (acc: bigint, v) => acc + BigInt((v as any) ?? 0),
            0n,
          );
        }

        // If 0, try to wait for dust sync
        if (dustBalance === 0n) {
          log.info("Dust balance is 0. Attempting to sync dust wallet...");
          try {
            dustBalance = await waitForDustFunds(walletResult.wallet, {
              timeoutMs: syncTimeoutMs,
            });
          } catch (_e) {
            log.warn("Dust sync timed out or returned no funds.");
          }
        }

        // 4. If still 0 and we have unshielded funds, register for dust!
        if (dustBalance === 0n && unshieldedBalance > 0n) {
          log.info(
            "Dust is 0 but unshielded funds available. Registering for dust generation...",
          );
          const success = await registerNightForDust(walletResult);
          if (success) {
            dustBalance = await waitForDustFunds(walletResult.wallet, {
              timeoutMs: 30000,
            });
          }
        }
      } catch (_e) {
        // ignore
      }

      log.info("==========================================");
      log.info("Balances");
      log.info("==========================================");
      log.info(`Shielded Balance:   ${shieldedBalance} NIGHT`);
      log.info(`Dust Balance:       ${dustBalance} DUST`);
      log.info(`Unshielded Balance: ${unshieldedBalance} NIGHT`);
    }

    log.info("==========================================");

    await walletResult.wallet.stop();
  } catch (error) {
    log.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    exit(1);
  }
}

if (import.meta.main) {
  main();
}
