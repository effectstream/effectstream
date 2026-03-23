import dotenv from "dotenv";
import { parseArgs } from "node:util";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  shieldedToken,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v8";

const log = console;
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { type DefaultConfiguration, WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
  InMemoryTransactionHistoryStorage,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { type ShieldedWalletState } from "@midnight-ntwrk/wallet-sdk-shielded";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { CONSTANTS } from "./constants.ts";
import type { NetworkUrls, WalletResult } from "./types.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";
import { getEnv, args as getArgs, exit, isNotFoundError } from "@effectstream/utils/runtime";

// ============================================================================
// Key Derivation
// ============================================================================

type DerivationRole = typeof Roles.Zswap | typeof Roles.Dust | typeof Roles.NightExternal;

function deriveSeedForRole(seed: string, role: DerivationRole): Uint8Array {
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
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${CONSTANTS.WALLET_SYNC_TIMEOUT_MS}ms`
  );
  return CONSTANTS.WALLET_SYNC_TIMEOUT_MS;
}

/**
 * Safely stringify progress objects that may contain bigint.
 */
export function safeStringifyProgress(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v
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
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }> {
  log.info(
    "Waiting for wallet to sync and receive funds (shielded/unshielded/dust)..."
  );

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced = latestState.shielded.state.progress.isStrictlyComplete();
    const dustSynced = latestState.dust.state.progress.isStrictlyComplete();
    const unshieldedSynced = latestState.unshielded?.progress?.isStrictlyComplete() ?? false;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
  }, CONSTANTS.WALLET_SYNC_THROTTLE_MS);

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        latestState = state;
        const shieldedSynced = state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        const unshieldedSynced = state.unshielded?.progress?.isStrictlyComplete() ?? false;
        log.info(
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
        );
      }),
      Rx.filter((state: any) => {
        const shieldedSynced = state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        const unshieldedSynced = state.unshielded?.progress?.isStrictlyComplete() ?? false;

        if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

        if (waitNonZero) {
          const tokenId = shieldedToken().tag;
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
            () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      })
    )
  );

  clearInterval(periodicLogger);

  const tokenId = shieldedToken().tag;

  const shieldedBalancesObj = state.shielded.balances || {};
  const availableKeys = Object.keys(shieldedBalancesObj);
  log.info(`Available shielded balance keys: ${availableKeys.length > 0 ? availableKeys.join(', ') : 'none'}`);
  log.info(`Looking for token ID: ${tokenId}`);

  const shieldedBalance = shieldedBalancesObj[tokenId] ?? 0n;
  log.info(`Shielded balance for token ${tokenId}: ${shieldedBalance}`);

  const unshieldedBalancesObj = (state.unshielded?.balances ?? {}) as Record<string, bigint>;
  const unshieldedBalance = Object.values(unshieldedBalancesObj).reduce(
    (acc, v) => acc + (v ?? 0n),
    0n
  );

  let dustBalance = 0n;
  try {
    dustBalance = state.dust?.balance?.(new Date()) ?? 0n;
  } catch (_err) {
    log.warn("Could not read dust balance from synced state; continuing with dustBalance=0");
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean }
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");

  const options = typeof optionsOrTimeout === 'number'
    ? { timeoutMs: optionsOrTimeout }
    : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;

  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    (dustWallet.state as Rx.Observable<any>).pipe(
      Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        try {
          const complete = state.state?.progress?.isStrictlyComplete();
          log.info(`Dust wallet sync progress: complete=${complete ?? "unknown"}`);
        } catch (_err) {
          // ignore logging errors
        }
      }),
      Rx.filter((state: any) => {
        try {
          return state.state?.progress?.isStrictlyComplete() === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: any) => {
        try {
          if (typeof state.balance === "function") {
            return state.balance(new Date()) as bigint;
          }
        } catch (_err) {
          // fall through
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

export function getInitialDustState(
  dustWallet: any
): Promise<any> {
  return Rx.firstValueFrom(dustWallet.state);
}

/**
 * Create wallet configuration for the modular Midnight SDK
 */
function createWalletConfiguration(
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
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
}

function buildShieldedWallet(config: DefaultConfiguration, seed: Uint8Array) {
  return ShieldedWallet(config as any).startWithSeed(seed);
}

function buildDustWallet(config: DefaultConfiguration, seed: Uint8Array) {
  const dustConfig = {
    ...config,
    costParameters: {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: CONSTANTS.DUST_FEE_OVERHEAD,
      feeBlocksMargin: CONSTANTS.DUST_FEE_BLOCKS_MARGIN,
    },
  };
  const dustParameters = LedgerParameters.initialParameters().dust;
  return DustWallet(dustConfig as any).startWithSeed(seed, dustParameters);
}

function buildUnshieldedWallet(
  config: DefaultConfiguration,
  keystore: UnshieldedKeystore,
) {
  return UnshieldedWallet({
    ...config,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  } as any).startWithPublicKey(PublicKey.fromKeyStore(keystore));
}

/**
 * Build a complete wallet facade with shielded, unshielded, and dust wallets
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

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);

  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);
  const dustWallet = buildDustWallet(config, dustSeed);
  const unshieldedWallet = buildUnshieldedWallet(config, unshieldedKeystore);

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);

  const wallet: WalletFacade = await WalletFacade.init({
    configuration: config as any,
    shielded: () => shieldedWallet,
    unshielded: () => unshieldedWallet,
    dust: () => dustWallet,
  });

  await wallet.start(zswapSecretKeys, dustSecretKey);

  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const dustState = await getInitialDustState(wallet.dust);

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys: zswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey: dustSecretKey,
    dustAddress: dustState.dustAddress,
    unshieldedAddress,
    unshieldedKeystore,
  };
}

export function getInitialShieldedState(
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Get initial state of unshielded wallet
 */
function getInitialUnshieldedState(
  unshieldedWallet: any
): Promise<any> {
  if (!unshieldedWallet) return Promise.resolve(null);
  if (unshieldedWallet.state && typeof unshieldedWallet.state.pipe === 'function') {
    return Rx.firstValueFrom(unshieldedWallet.state);
  }
  if (typeof unshieldedWallet.state === 'function') {
    return Rx.firstValueFrom(unshieldedWallet.state());
  }
  return Promise.resolve(null);
}

/**
 * Register unshielded Night UTXOs for dust generation
 * This is required before the wallet can pay transaction fees
 */
export async function registerNightForDust(walletResult: WalletResult): Promise<boolean> {
  log.info("Checking for unshielded Night UTXOs to register for dust generation...");

  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(
      Rx.filter((s: any) => s.isSynced)
    )
  );

  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter((coin: any) => coin.meta.registeredForDustGeneration === false) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    log.info("No unregistered unshielded Night UTXOs available.");
    const dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: 5000 });
    return dustBalance > 0n;
  }

  log.info(`Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`);

  try {
    const recipe = await (walletResult.wallet as any).registerNightUtxosForDustGeneration(
      unregisteredNightUtxos,
      walletResult.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload)
    );

    const signedRecipe: UnprovenTransaction = await (walletResult.wallet as any).signUnprovenTransaction(
      recipe.transaction,
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
    );

    log.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await (walletResult.wallet as any).finalizeTransaction(signedRecipe)
    );
    log.info(`Dust registration submitted with tx id: ${txId}`);

    log.info("Waiting for dust to be generated...");
    await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.throttleTime(CONSTANTS.WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const dustBalance = s.dust?.balance?.(new Date()) ?? 0n;
          log.info(`Current dust balance: ${dustBalance}`);
        }),
        Rx.filter((s: any) => (s.dust?.balance?.(new Date()) ?? 0n) > 0n),
        Rx.timeout({
          each: resolveWalletSyncTimeoutMs(),
          with: () => Rx.throwError(() => new Error("Timeout waiting for dust generation"))
        })
      )
    );

    log.info("Dust registration complete!");
    return true;
  } catch (e) {
    log.error(`Failed to register Night UTXOs for dust: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { values: parsedArgs } = parseArgs({
    args: getArgs(),
    options: {
      seed: { type: "string" },
      balance: { type: "boolean", default: false },
    },
    strict: false,
  });

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

  if (seed?.startsWith("000000000000000000000000000000000000000000000000000000000000000")) {
    log.warn("⚠️  Genesis seeds (0x000...001, 0x000...002, etc.) only have funds on 'undeployed' local networks!");
    log.warn("⚠️  For testnet/preview networks, you need to:");
    log.warn("   1. Generate a new wallet seed, OR");
    log.warn("   2. Request funds from a faucet for this wallet");
  }

  const indexer = getEnv("MIDNIGHT_INDEXER_URL") || midnightNetworkConfig.indexer;
  const indexerWS = getEnv("MIDNIGHT_INDEXER_WS_URL") || midnightNetworkConfig.indexerWS;
  const node = getEnv("MIDNIGHT_NODE_URL") || midnightNetworkConfig.node;
  const proofServer = getEnv("MIDNIGHT_PROOF_SERVER_URL") || midnightNetworkConfig.proofServer;

  const networkUrls: Required<NetworkUrls> = {
    id: "placeholder-value",
    indexer,
    indexerWS,
    node,
    proofServer
  };

  const networkIdRaw = getEnv("MIDNIGHT_NETWORK_ID") || "undeployed";

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
      networkId = "preview" as NetworkId.NetworkId;
      log.info(`Using preview network (addresses will have mn_addr_preview prefix)`);
      break;
    default:
      log.warn(`Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`);
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

    const initialState = await getInitialShieldedState(walletResult.wallet.shielded);
    const shieldedAddress = initialState.address.coinPublicKeyString();

    log.info("==========================================");
    log.info("Wallet Addresses");
    log.info("==========================================");
    log.info(`Shielded Address:   ${shieldedAddress}`);
    log.info(`Unshielded Address: ${walletResult.unshieldedAddress}`);
    log.info(`Dust Address:       ${walletResult.dustAddress}`);
    log.info("==========================================");

    if (parsedArgs.balance) {
      log.info("==========================================");
      log.info("Fetching Balances...");
      log.info("==========================================");

      let shieldedBalance = 0n;
      let unshieldedBalance = 0n;
      let dustBalance = 0n;

      const tokenId = shieldedToken().tag;
      shieldedBalance = initialState.balances[tokenId] ?? 0n;

      const syncTimeoutMs = resolveWalletSyncTimeoutMs();

      if (shieldedBalance === 0n) {
        log.info("Shielded balance is 0. Waiting for wallet sync to confirm funds...");
        try {
          const synced = await syncAndWaitForFunds(walletResult.wallet);
          shieldedBalance = synced.shieldedBalance;
          unshieldedBalance = synced.unshieldedBalance;
          dustBalance = synced.dustBalance;
        } catch (e) {
          log.warn(`Sync timed out or failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        try {
          const unshieldedState = await getInitialUnshieldedState((walletResult.wallet as any).unshielded);
          const uBalances = (unshieldedState?.balances ?? {}) as Record<string, bigint>;
          unshieldedBalance = Object.values(uBalances).reduce(
            (acc: bigint, v) => acc + (v ?? 0n),
            0n
          );
        } catch(_e) { /* ignore */ }

        try {
          const state = await Rx.firstValueFrom(walletResult.wallet.state());
          dustBalance = (state as any).dust?.balance?.(new Date()) ?? 0n;

          if (dustBalance === 0n) {
            log.info("Dust balance is 0. Attempting to sync dust wallet...");
            try {
              dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: syncTimeoutMs });
            } catch(_e) {
              log.warn("Dust sync timed out or returned no funds.");
            }
          }

          if (dustBalance === 0n && unshieldedBalance > 0n) {
            log.info("Dust is 0 but unshielded funds available. Registering for dust generation...");
            const success = await registerNightForDust(walletResult);
            if (success) {
              dustBalance = await waitForDustFunds(walletResult.wallet, { timeoutMs: 30000 });
            }
          }
        } catch (_e) {
          // ignore
        }
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
    log.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}

if (import.meta.main) {
  main();
}
