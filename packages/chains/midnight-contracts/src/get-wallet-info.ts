import * as log from "@std/log";
import { load } from "@std/dotenv";
import { parseArgs } from "@std/cli/parse-args";
import type {
  MidnightBech32m,
  ShieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  WalletBuilder as UnshieldedWalletBuilder,
  createKeystore,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  LedgerParameters,
  ZswapSecretKeys,
  DustSecretKey,
  shieldedToken,
} from "@midnight-ntwrk/ledger-v6";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";

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

// ============================================================================
// Types
// ============================================================================

export interface NetworkUrls {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
}

export const DEFAULT_NETWORK_URLS: Required<NetworkUrls> = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

export interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  walletDustSecretKey: DustSecretKey;
  dustAddress: string;
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
 * Resolve sync timeout from env or default.
 */
export function resolveWalletSyncTimeoutMs(): number {
  const envValue = Deno.env.get("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${WALLET_SYNC_TIMEOUT_MS}ms`
  );
  return WALLET_SYNC_TIMEOUT_MS;
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
  options?: { timeoutMs?: number },
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }> {
  log.info(
    "Waiting for wallet to sync and receive funds (shielded/unshielded/dust)..."
  );

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced =
      latestState.shielded.state.progress.isStrictlyComplete();
    const dustSynced = latestState.dust.state.progress.isStrictlyComplete();
    const unshieldedSynced =
      latestState.unshielded?.syncProgress?.synced ?? false;
    log.info(
      `[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
    );
    log.debug(
      `[wait detail] shielded=${safeStringifyProgress(
        latestState.shielded.state.progress
      )} | unshielded=${safeStringifyProgress(
        latestState.unshielded?.syncProgress ?? "n/a"
      )} | dust=${safeStringifyProgress(latestState.dust.state.progress)}`
    );
  }, WALLET_SYNC_THROTTLE_MS);

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: any) => {
        latestState = state;
        const shieldedSynced =
          state.shielded.state.progress.isStrictlyComplete();
        const dustSynced = state.dust.state.progress.isStrictlyComplete();
        const unshieldedSynced = state.unshielded?.syncProgress?.synced ?? false;
        log.info(
          `Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced}`
        );
        log.debug(
          `Progress detail | shielded=${safeStringifyProgress(
            state.shielded.state.progress
          )} | unshielded=${safeStringifyProgress(
            state.unshielded?.syncProgress ?? "n/a"
          )} | dust=${safeStringifyProgress(state.dust.state.progress)}`
        );
      }),
      Rx.filter(
        (state: any) =>
          state.shielded.state.progress.isStrictlyComplete() &&
          state.dust.state.progress.isStrictlyComplete() &&
          (state.unshielded?.syncProgress?.synced ?? false)
      ),
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

  // Get the actual token identifier - use the .raw property which is the hex string
  const tokenObj = shieldedToken();
  const tokenId = tokenObj.raw;

  // Log all available balances for debugging
  const shieldedBalancesObj = state.shielded.balances || {};
  const availableKeys = Object.keys(shieldedBalancesObj);
  log.info(`Available shielded balance keys: ${availableKeys.length > 0 ? availableKeys.join(', ') : 'none'}`);
  
  // Log all balances with their values
  if (availableKeys.length > 0) {
    for (const key of availableKeys) {
      log.info(`  Balance[${key}] = ${shieldedBalancesObj[key]}`);
    }
  }
  
  log.info(`Looking for token ID: ${tokenId}`);
  
  const shieldedBalance = shieldedBalancesObj[tokenId] ?? 0n;
  log.info(`Shielded balance for token ${tokenId}: ${shieldedBalance}`);
  
  // Also calculate total across all tokens
  const totalShieldedBalance = Object.values(shieldedBalancesObj).reduce<bigint>(
    (acc, v) => acc + (v as bigint),
    0n
  );
  log.info(`Total shielded balance (all tokens): ${totalShieldedBalance}`);
  
  // Handle unshielded balances - could be Map or Record
  const unshieldedBalances = 
    // deno-lint-ignore no-explicit-any
    ((state as any).unshielded?.balances as Map<string, bigint> | Record<string, bigint> | undefined);
  
  log.info(`Unshielded balances exists: ${!!unshieldedBalances}`);
  
  let unshieldedBalance = 0n;
  if (unshieldedBalances) {
    if (unshieldedBalances instanceof Map) {
      // Convert BigInt values to strings for logging
      const loggableMap = new Map(
        Array.from(unshieldedBalances.entries()).map(([k, v]) => [k, v.toString()])
      );
      log.info(`Unshielded balances (Map): ${JSON.stringify(Object.fromEntries(loggableMap))}`);
      unshieldedBalance = Array.from(unshieldedBalances.values()).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n
      );
    } else {
      // Convert BigInt values to strings for logging
      const loggableRecord = Object.fromEntries(
        Object.entries(unshieldedBalances).map(([k, v]) => [k, v.toString()])
      );
      log.info(`Unshielded balances (Record): ${JSON.stringify(loggableRecord)}`);
      unshieldedBalance = Object.values(unshieldedBalances).reduce(
        (acc, v) => acc + (v ?? 0n),
        0n
      );
    }
  }
  
  // Try to resolve dust balance; if unavailable or times out, return 0n
  let dustBalance = 0n;
  try {
    dustBalance = await waitForDustFunds(wallet, syncTimeoutMs);
  } catch (_err) {
    log.warn("Dust wallet did not report funds within timeout; continuing with dustBalance=0");
  }
  
  return { shieldedBalance, unshieldedBalance, dustBalance };
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  syncTimeoutMs: number
): Promise<bigint> {
  log.info("Waiting for dust wallet to sync and receive funds...");
  // deno-lint-ignore no-explicit-any
  const dustWallet = (wallet as any).dust;
  if (!dustWallet || !dustWallet.state) {
    log.warn("Dust wallet state not available; skipping dust balance wait.");
    return 0n;
  }

  const dustBalance = (await Rx.firstValueFrom(
    dustWallet.state.pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.tap((state: unknown) => {
        try {
          // best-effort progress logging
          const progress = (state as { state?: { progress?: { isCompleteWithin?: (gap: bigint) => boolean } } })
            ?.state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          log.info(`Dust wallet sync progress: complete=${complete ?? "unknown"}`);
        } catch (_err) {
          // ignore logging errors
        }
      }),
      Rx.filter((state: unknown) => {
        try {
          const progress = (state as { state?: { progress?: { isCompleteWithin?: (gap: bigint) => boolean } } })
            ?.state?.progress;
          return progress?.isCompleteWithin?.(0n) === true;
        } catch (_err) {
          return false;
        }
      }),
      Rx.map((state: unknown) => {
        // Try to read balance from wallet state helper if present.
        try {
          if (typeof (state as { walletBalance?: (d: Date) => bigint }).walletBalance === "function") {
            return (state as { walletBalance: (d: Date) => bigint }).walletBalance(new Date());
          }
          // Fallback to balances map if exposed
          const balances = (state as { balances?: Record<string, bigint> }).balances;
          if (balances) {
            const total = Object.values(balances).reduce(
              (acc: bigint, v) => acc + BigInt(v ?? 0),
              0n
            );
            return total;
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
      Rx.filter((balance: bigint) => balance > 0n),
      Rx.tap((balance: bigint) => log.info(`Dust wallet balance: ${balance}`))
    )
  )) as bigint;

  return dustBalance;
}

export function getInitialDustState(
  // deno-lint-ignore no-explicit-any
  dustWallet: any
// deno-lint-ignore no-explicit-any
): Promise<any> {
  return Rx.firstValueFrom(dustWallet.state);
}

type NetworkIdCasing = "lower" | "upper";

/**
 * Normalize network ID for ledger operations.
 * Some ledger flows expect lowercase ("undeployed"), others expect capitalized ("Undeployed").
 */
function normalizeNetworkId(
  networkId: NetworkId.NetworkId,
  casing: NetworkIdCasing = "lower",
): NetworkId.NetworkId {
  if (typeof networkId !== "string") return networkId;
  return (casing === "upper"
    ? networkId.charAt(0).toUpperCase() + networkId.slice(1).toLowerCase()
    : networkId.toLowerCase()) as NetworkId.NetworkId;
}

/**
 * Create wallet configuration for the modular Midnight SDK
 * Accepts NetworkId enum values and normalizes them for ledger compatibility
 */
export function createWalletConfiguration(
  networkUrls: Required<NetworkUrls>,
  networkId: NetworkId.NetworkId,
  options?: { ledgerNetworkCasing?: NetworkIdCasing },
): DefaultV1Configuration {
  const normalizedNetworkId = normalizeNetworkId(
    networkId,
    options?.ledgerNetworkCasing ?? "lower",
  );
  
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    provingServerUrl: new URL(networkUrls.proofServer),
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: normalizedNetworkId,
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

export async function buildUnshieldedWallet(
  networkUrls: Required<NetworkUrls>,
  seed: Uint8Array,
  networkId: NetworkId.NetworkId
): Promise<Awaited<ReturnType<typeof UnshieldedWalletBuilder.build>>> {
  const keystore = createKeystore(seed, networkId);
  const publicKey = PublicKey.fromKeyStore(keystore);

  return await UnshieldedWalletBuilder.build({
    publicKey,
    networkId: networkId,
    indexerUrl: networkUrls.indexerWS,
  });
}

/**
 * Build a complete wallet facade with shielded, unshielded, and dust wallets
 * Expects NetworkId enum values (capitalized format required by ledger operations)
 */
export async function buildWalletFacade(
  networkUrls: Required<NetworkUrls>,
  seed: string,
  networkId: NetworkId.NetworkId,
  options?: { ledgerNetworkCasing?: NetworkIdCasing },
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const config = createWalletConfiguration(networkUrls, networkId, options);

  const shieldedWallet = buildShieldedWallet(config, shieldedSeed);
  const dustWallet = buildDustWallet(config, dustSeed);
  const unshieldedWallet = await buildUnshieldedWallet(networkUrls, unshieldedSeed, networkId);

  // deno-lint-ignore no-explicit-any
  const wallet = new WalletFacade(shieldedWallet as any, unshieldedWallet as any, dustWallet);

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
  // deno-lint-ignore no-explicit-any
  shieldedWallet: any
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Get initial state of unshielded wallet
 */
function getInitialUnshieldedState(
  // deno-lint-ignore no-explicit-any
  unshieldedWallet: any
// deno-lint-ignore no-explicit-any
): Promise<any> {
  if (!unshieldedWallet) return Promise.resolve(null);
  if (typeof unshieldedWallet.state === 'function') {
    return Rx.firstValueFrom(unshieldedWallet.state());
  }
  return Promise.resolve(null);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
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

  // Parse command-line arguments
  const args = parseArgs(Deno.args, {
    string: ["seed"],
    boolean: ["balance"],
    default: {
      balance: false,
    },
  });

  // Load .env.testnet if it exists
  try {
    await load({ envPath: ".env.testnet", export: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
        log.warn(`Failed to load .env.testnet: ${error}`);
    }
  }

  const envSeed = Deno.env.get("MIDNIGHT_WALLET_SEED");
  const argSeed = args.seed;
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
  if (seed?.startsWith("000000000000000000000000000000000000000000000000000000000000000")) {
    log.warn("⚠️  Genesis seeds (0x000...001, 0x000...002, etc.) only have funds on 'undeployed' local networks!");
    log.warn("⚠️  For testnet/preview networks, you need to:");
    log.warn("   1. Generate a new wallet seed, OR");
    log.warn("   2. Request funds from a faucet for this wallet");
  }

  // Network Configuration
  const indexer = Deno.env.get("MIDNIGHT_INDEXER_URL") || DEFAULT_NETWORK_URLS.indexer;
  const indexerWS = Deno.env.get("MIDNIGHT_INDEXER_WS_URL") || DEFAULT_NETWORK_URLS.indexerWS;
  const node = Deno.env.get("MIDNIGHT_NODE_URL") || DEFAULT_NETWORK_URLS.node;
  const proofServer = Deno.env.get("MIDNIGHT_PROOF_SERVER_URL") || DEFAULT_NETWORK_URLS.proofServer;
  
  const networkUrls: Required<NetworkUrls> = { indexer, indexerWS, node, proofServer };
  
  const networkIdRaw = Deno.env.get("MIDNIGHT_NETWORK_ID") || "undeployed";
  
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
      log.info(`Using preview network (addresses will have mn_addr_preview prefix)`);
      break;
    default:
      log.warn(`Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`);
      networkId = networkIdRaw as NetworkId.NetworkId;
  }

  log.info(`Using network ID: ${networkId}`);
  log.info(`Indexer: ${indexer}`);
  log.info(`Node: ${node}`);
  setNetworkId(networkId);

  try {
    log.info("Building wallet...");
    const walletResult = await buildWalletFacade(networkUrls, seed, networkId);
    
    const initialState = await getInitialShieldedState(walletResult.wallet.shielded);
    const shieldedAddress = initialState.address.coinPublicKeyString();

    const dustState = await getInitialDustState(walletResult.wallet.dust);

    log.info("==========================================");
    log.info("Wallet Addresses");
    log.info("==========================================");
    log.info(`Shielded Address:   ${shieldedAddress}`);
    log.info(`Dust Address:       ${walletResult.dustAddress}`);
    
    // Attempt to get unshielded address
    try {
        // deno-lint-ignore no-explicit-any
        const unshieldedState = await getInitialUnshieldedState((walletResult.wallet as any).unshielded);
        if (unshieldedState?.address) {
            log.info(`Unshielded Address: ${unshieldedState.address}`);
        }
    } catch (_e) {
        // ignore
    }

    // Only fetch balances if --balance flag is provided
    if (args.balance) {
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
          log.info("Shielded balance is 0. Waiting for wallet sync to confirm funds...");
          try {
               const synced = await syncAndWaitForFunds(walletResult.wallet);
               shieldedBalance = synced.shieldedBalance;
               unshieldedBalance = synced.unshieldedBalance;
          } catch (e) {
              log.warn(`Sync timed out or failed: ${e instanceof Error ? e.message : String(e)}`);
              // fall back to what we have
          }
      } else {
          // If we have shielded balance, we should still check unshielded state manually
          try {
               // deno-lint-ignore no-explicit-any
               const unshieldedState = await getInitialUnshieldedState((walletResult.wallet as any).unshielded);
               // deno-lint-ignore no-explicit-any
               const uBalances = unshieldedState?.balances;
               if (uBalances) {
                  // Handle both Map and Record types
                  const balancesArray = uBalances instanceof Map 
                      ? Array.from(uBalances.values())
                      : Object.values(uBalances);
                  unshieldedBalance = balancesArray.reduce(
                    (acc: bigint, v) => acc + BigInt(v as any ?? 0),
                    0n
                  );
               }
          } catch(_e) { /* ignore */ }
      }

      // 3. Check Dust balance
      try {
           // Get from current state first
           const dBalances = (dustState as { balances?: Record<string, bigint> }).balances;
           if (dBalances) {
               dustBalance = Object.values(dBalances).reduce(
                 (acc: bigint, v) => acc + BigInt(v ?? 0),
                 0n
               );
           }

           // If 0, try to wait for dust sync
           if (dustBalance === 0n) {
               log.info("Dust balance is 0. Attempting to sync dust wallet...");
               try {
                  dustBalance = await waitForDustFunds(walletResult.wallet, syncTimeoutMs);
               } catch(_e) {
                   log.warn("Dust sync timed out or returned no funds.");
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
    log.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
