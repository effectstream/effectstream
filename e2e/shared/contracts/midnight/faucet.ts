import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { UnprovenTransactionRecipe, WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  DustSecretKey,
  LedgerParameters,
  nativeToken,
  shieldedToken,
  UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v7";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import type { DefaultV1Configuration } from "@midnight-ntwrk/wallet-sdk-shielded/v1";

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts
 */

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

/** Additional fee overhead for dust transactions (in smallest unit) */
const DUST_FEE_OVERHEAD = 300_000_000_000_000n;

/** Fee blocks margin for dust wallet (overridable via MIDNIGHT_DUST_FEE_BLOCKS_MARGIN) */
const DUST_FEE_BLOCKS_MARGIN = 5;

/** Wallet sync progress logging throttle interval */
const WALLET_SYNC_THROTTLE_MS = 10_000;

/** Wallet sync timeout (5 minutes) */
const WALLET_SYNC_TIMEOUT_MS = 300_000;

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

// ============================================================================
// Types
// ============================================================================

interface Config {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

const DEFAULT_NETWORK_URLS: Required<Config> = {
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
  unshieldedAddress: string;
  unshieldedKeystore: UnshieldedKeystore;
}

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
 * Create wallet configuration for the modular Midnight SDK
 */
export function createWalletConfiguration(
  networkUrls: Required<Config>,
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

export function buildShieldedWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array,
): ReturnType<ReturnType<typeof ShieldedWallet>["startWithShieldedSeed"]> {
  const shieldedBuilder = ShieldedWallet(config);
  return shieldedBuilder.startWithShieldedSeed(seed);
}

export function buildDustWallet(
  config: DefaultV1Configuration,
  seed: Uint8Array,
): ReturnType<ReturnType<typeof DustWallet>["startWithSeed"]> {
  const legacyLedgerParams = LedgerParameters.initialParameters();
  const resolvedFeeBlocksMargin = resolveDustFeeBlocksMargin();
  const resolvedFeeOverhead = resolveDustFeeOverhead();
  const dustConfig = {
    ...config,
    costParameters: {
      additionalFeeOverhead: resolvedFeeOverhead,
      feeBlocksMargin: resolvedFeeBlocksMargin,
    },
  };
  const dustBuilder = DustWallet(dustConfig);
  const dustParameters = legacyLedgerParams.dust;

  return dustBuilder.startWithSeed(seed, dustParameters);
}

export function buildUnshieldedWallet(
  networkUrls: Required<Config>,
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
 */
export async function buildWalletFacade(
  networkUrls: Required<Config>,
  seed: string,
  networkId: NetworkId.NetworkId,
): Promise<WalletResult> {
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const walletConfig = createWalletConfiguration(networkUrls, networkId);

  const shieldedWallet = buildShieldedWallet(walletConfig, shieldedSeed);
  const dustWallet = buildDustWallet(walletConfig, dustSeed);
  const unshieldedWallet = buildUnshieldedWallet(
    networkUrls,
    unshieldedSeed,
    networkId,
  );

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();

  const wallet = new WalletFacade(
    shieldedWallet as any,
    unshieldedWallet as any,
    dustWallet,
  );

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
  shieldedWallet: any,
): Promise<ShieldedWalletState> {
  return Rx.firstValueFrom(shieldedWallet.state);
}

/**
 * Resolve sync timeout from env or default.
 */
export function resolveWalletSyncTimeoutMs(): number {
  const envValue = Deno.env.get("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  console.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${WALLET_SYNC_TIMEOUT_MS}ms`,
  );
  return WALLET_SYNC_TIMEOUT_MS;
}

const resolveDustFeeBlocksMargin = (): number => {
  const envValue = Deno.env.get("MIDNIGHT_DUST_FEE_BLOCKS_MARGIN");
  if (!envValue) return DUST_FEE_BLOCKS_MARGIN;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  console.warn(
    `Invalid MIDNIGHT_DUST_FEE_BLOCKS_MARGIN="${envValue}", using default ${DUST_FEE_BLOCKS_MARGIN}`,
  );
  return DUST_FEE_BLOCKS_MARGIN;
};

const resolveDustFeeOverhead = (): bigint => {
  const envValue = Deno.env.get("MIDNIGHT_DUST_FEE_OVERHEAD");
  if (!envValue) return DUST_FEE_OVERHEAD;
  try {
    return BigInt(envValue);
  } catch (_error) {
    console.warn(
      `Invalid MIDNIGHT_DUST_FEE_OVERHEAD="${envValue}", using default ${DUST_FEE_OVERHEAD}`,
    );
    return DUST_FEE_OVERHEAD;
  }
};

const resolveNativeTokenId = (): string => {
  const token = nativeToken() as unknown as { raw?: string };
  if (typeof token === "string") return token;
  if (token && typeof token.raw === "string") return token.raw;
  return String(token);
};

const sumUnshieldedBalances = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): bigint => {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    return Array.from(balances.values()).reduce(
      (acc, v) => acc + (v ?? 0n),
      0n,
    );
  }
  return Object.values(balances).reduce((acc, v) => acc + (v ?? 0n), 0n);
};

const resolveUnshieldedTokenId = async (
  wallet: WalletFacade,
): Promise<string> => {
  const state = await Rx.firstValueFrom(wallet.state());
  const balances = (state as any).unshielded?.balances as
    | Map<string, bigint>
    | Record<string, bigint>
    | undefined;
  if (balances) {
    const keys = balances instanceof Map
      ? Array.from(balances.keys())
      : Object.keys(balances);
    const preferred = resolveNativeTokenId();
    if (keys.includes(preferred)) return preferred;
    if (keys.length > 0) return keys[0];
  }
  return resolveNativeTokenId();
};

/**
 * Wait for wallet to be synced and funded
 */
export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean; logLabel?: string },
): Promise<
  { shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }
> {
  const logPrefix = options?.logLabel ? `[${options.logLabel}] ` : "";
  console.info(
    `${logPrefix}Waiting for wallet to sync and receive funds (shielded/dust)...`,
  );

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced =
      latestState.shielded.state.progress.isStrictlyComplete() ||
      (latestState.isSynced ?? false);
    const dustSynced = latestState.dust.state.progress.isStrictlyComplete() ||
      (latestState.isSynced ?? false);
    const unshieldedSynced = latestState.unshielded?.syncProgress?.synced ??
      (latestState.isSynced ?? false);
    const shieldedBalances = latestState.shielded?.balances ?? {};
    const balanceKeys = Object.keys(shieldedBalances);

    const unshieldedBalanceLog = sumUnshieldedBalances(
      latestState.unshielded?.balances,
    );

    console.info(
      `${logPrefix}[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} | shieldedKeys: [${
        balanceKeys.join(", ")
      }] | unshieldedBalance: ${unshieldedBalanceLog}`,
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
          const dustSynced = state.dust.state.progress.isStrictlyComplete() ||
            isSynced;
          const unshieldedSynced = state.unshielded?.syncProgress?.synced ??
            isSynced;
          const tokenRaw = shieldedToken().raw;
          const tokenTag = shieldedToken().tag;
          const shieldedBalance = state.shielded.balances[tokenRaw] ?? 0n;
          const keys = Object.keys(state.shielded.balances);

          const unshieldedBalanceLog = sumUnshieldedBalances(
            state.unshielded?.balances,
          );

          console.info(
            `${logPrefix}Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`,
          );
          console.info(
            `${logPrefix}Balance check: tokenRaw=${tokenRaw}, tokenTag=${tokenTag}, shieldedBal=${shieldedBalance}, unshieldedBal=${unshieldedBalanceLog}, availableKeys=[${
              keys.join(", ")
            }]`,
          );
        }),
        Rx.filter((state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedSynced =
            state.shielded.state.progress.isStrictlyComplete() || isSynced;
          const dustSynced = state.dust.state.progress.isStrictlyComplete() ||
            isSynced;
          const unshieldedSynced = state.unshielded?.syncProgress?.synced ??
            isSynced;

          if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

          if (waitNonZero) {
            const shieldedBalance =
              state.shielded.balances[shieldedToken().raw] ?? 0n;

            const unshieldedBalanceCheck = sumUnshieldedBalances(
              state.unshielded?.balances,
            );

            if (shieldedBalance > 0n || unshieldedBalanceCheck > 0n) {
              return true;
            }

            return false;
          }

          return true;
        }),
        Rx.tap(() => console.info(`${logPrefix}Wallet sync complete`)),
        Rx.timeout({
          each: syncTimeoutMs,
          with: () =>
            Rx.throwError(
              () => new Error(`Wallet sync timeout after ${syncTimeoutMs}ms`),
            ),
        }),
      ),
    );
  } finally {
    clearInterval(periodicLogger);
  }

  const tokenObj = shieldedToken();
  const tokenId = tokenObj.raw;

  const shieldedBalance = (state as any).shielded.balances[tokenId] ?? 0n;

  // Handle unshielded balances
  const unshieldedBalances = (state as any).unshielded?.balances as
    | Map<string, bigint>
    | Record<string, bigint>
    | undefined;

  const unshieldedBalance = sumUnshieldedBalances(unshieldedBalances);

  let dustBalance = 0n;
  try {
    dustBalance = await waitForDustFunds(wallet, {
      timeoutMs: syncTimeoutMs,
      waitNonZero,
    });
  } catch (_err) {
    console.warn(
      "Dust wallet did not report funds within timeout; continuing with dustBalance=0",
    );
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

export async function waitForUnshieldedFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number },
): Promise<bigint> {
  console.info("Waiting for unshielded wallet funds...");
  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();

  const balance = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.filter((state: any) => {
        const isSynced = state.isSynced ?? false;
        return state.unshielded?.syncProgress?.synced ?? isSynced;
      }),
      Rx.map((state: any) => sumUnshieldedBalances(state.unshielded?.balances)),
      Rx.filter((value: bigint) => value > 0n),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () =>
              new Error(
                `Unshielded wallet sync timeout after ${syncTimeoutMs}ms`,
              ),
          ),
      }),
    ),
  );

  return balance;
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?: number | { timeoutMs?: number; waitNonZero?: boolean },
): Promise<bigint> {
  console.info("Waiting for dust wallet to sync and receive funds...");

  const options = typeof optionsOrTimeout === "number"
    ? { timeoutMs: optionsOrTimeout }
    : optionsOrTimeout;

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;

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
          const progress = (state as any).state?.progress;
          const complete = progress?.isCompleteWithin?.(0n);
          console.info(
            `Dust wallet sync progress: complete=${complete ?? "unknown"}`,
          );
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
              0n,
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
            () =>
              new Error(`Dust wallet sync timeout after ${syncTimeoutMs}ms`),
          ),
      }),
      Rx.filter((balance: bigint) => !waitNonZero || balance > 0n),
      Rx.tap((balance: bigint) => {
        if (balance > 0n) console.info(`Dust wallet balance: ${balance}`);
      }),
    ),
  )) as bigint;

  return dustBalance;
}

/**
 * Register unshielded Night UTXOs for dust generation.
 */
export async function registerNightForDust(
  walletResult: WalletResult,
): Promise<boolean> {
  console.info(
    "Checking for unshielded Night UTXOs to register for dust generation...",
  );

  const state = await Rx.firstValueFrom(
    walletResult.wallet.state().pipe(
      Rx.filter((s: any) => s.isSynced),
    ),
  );

  const unregisteredNightUtxos =
    (state as any).unshielded?.availableCoins?.filter(
      (coin: any) => coin.meta.registeredForDustGeneration === false,
    ) ?? [];

  if (unregisteredNightUtxos.length === 0) {
    console.info("No unregistered unshielded Night UTXOs available.");
    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: 5000,
    });
    return dustBalance > 0n;
  }

  console.info(
    `Found ${unregisteredNightUtxos.length} unregistered Night UTXOs. Registering for dust...`,
  );

  try {
    const recipe: UnprovenTransactionRecipe = await walletResult.wallet
      .registerNightUtxosForDustGeneration(
        unregisteredNightUtxos,
        walletResult.unshieldedKeystore.getPublicKey(),
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );

    const signedRecipe: UnprovenTransaction = await walletResult.wallet.signUnprovenTransaction(recipe.transaction, (payload: Uint8Array) =>
      walletResult.unshieldedKeystore.signData(payload),
    );

    console.info("Submitting dust registration transaction...");
    const txId = await walletResult.wallet.submitTransaction(
      await walletResult.wallet.finalizeTransaction(signedRecipe),
    );
    console.info(`Dust registration submitted with tx id: ${txId}`);

    console.info("Waiting for dust to be generated...");
    await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
        Rx.tap((s: any) => {
          const dustBalance = s.dust?.walletBalance?.(new Date()) ?? 0n;
          console.info(`Current dust balance: ${dustBalance}`);
        }),
        Rx.filter((s: any) => (s.dust?.walletBalance?.(new Date()) ?? 0n) > 0n),
        Rx.timeout({
          each: resolveWalletSyncTimeoutMs(),
          with: () =>
            Rx.throwError(() =>
              new Error("Timeout waiting for dust generation")
            ),
        }),
      ),
    );

    console.info("Dust registration complete!");
    return true;
  } catch (e) {
    console.error(
      `Failed to register Night UTXOs for dust: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return false;
  }
}

const resolveNetworkUrls = (): Required<Config> => ({
  indexer: Deno.env.get("MIDNIGHT_INDEXER_URL") || DEFAULT_NETWORK_URLS.indexer,
  indexerWS: Deno.env.get("MIDNIGHT_INDEXER_WS_URL") ||
    DEFAULT_NETWORK_URLS.indexerWS,
  node: Deno.env.get("MIDNIGHT_NODE_URL") || DEFAULT_NETWORK_URLS.node,
  proofServer: Deno.env.get("MIDNIGHT_PROOF_SERVER_URL") ||
    DEFAULT_NETWORK_URLS.proofServer,
});

const resolveNetworkId = (): NetworkId.NetworkId => {
  const networkIdRaw = Deno.env.get("MIDNIGHT_NETWORK_ID") || "undeployed";
  switch (networkIdRaw.toLowerCase()) {
    case "undeployed":
      return NetworkId.NetworkId.Undeployed;
    case "testnet":
    case "testnet-02":
      return NetworkId.NetworkId.TestNet;
    case "devnet":
    case "qanet":
      return NetworkId.NetworkId.DevNet;
    case "preview":
      console.info(
        "Using preview network (addresses will have mn_addr_preview prefix)",
      );
      return "preview" as NetworkId.NetworkId;
    default:
      console.warn(
        `Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`,
      );
      return networkIdRaw as NetworkId.NetworkId;
  }
};

const transfer = async (
  walletResult: WalletResult,
  receiverAddress: string,
  tokenId: string,
  amount: bigint = 10_000_000_000n,
): Promise<string> => {
  console.log(
    `Transferring ${amount} to ${receiverAddress} (tokenId=${tokenId})`,
  );

  try {
    const ttl = new Date(Date.now() + TTL_DURATION_MS);
    const recipe = await walletResult.wallet.transferTransaction(
      [{
        type: "unshielded",
        outputs: [{
          amount,
          type: tokenId,
          receiverAddress,
        }],
      }],
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      },
      { ttl },
    );
    console.log("✓ Transfer transaction created");

    const signSegment = (payload: Uint8Array) =>
      walletResult.unshieldedKeystore.signData(payload);

    const x: UnprovenTransaction = await walletResult.wallet.signUnprovenTransaction(recipe.transaction, (payload: Uint8Array) =>
      walletResult.unshieldedKeystore.signData(payload),
    );

    // let signedRecipe = recipe as typeof recipe;
    // if (recipe.type === "TransactionToProve") {
    //   const signedTx = await walletResult.wallet.signTransaction(
    //     recipe.transaction,
    //     signSegment,
    //   );
    //   signedRecipe = { ...recipe, transaction: signedTx };
    // } else if (recipe.type === "BalanceTransactionToProve") {
    //   const signedTx = await walletResult.wallet.signTransaction(
    //     recipe.transactionToProve,
    //     signSegment,
    //   );
    //   signedRecipe = { ...recipe, transactionToProve: signedTx };
    // } else if (recipe.type === "NothingToProve") {
    //   const signedTx = await walletResult.wallet.signTransaction(
    //     recipe.transaction as any,
    //     signSegment,
    //   );
    //   signedRecipe = { ...recipe, transaction: signedTx };
    // }
    console.log("✓ Transfer transaction signed");

    const finalizedTx = await walletResult.wallet.finalizeTransaction(
      x,
    );
    console.log("✓ Transfer transaction finalized");

    const txId = await walletResult.wallet.submitTransaction(finalizedTx);
    console.log({ txId });
    console.log(
      `✅ Successfully transferred Night tokens to ${receiverAddress}`,
    );
    return String(txId);
  } catch (error) {
    console.error("❌ Error during transfer:", error);
    throw error;
  }
};

export const faucet = async (
  receiverAddresses: string | string[],
  seed: string = GENESIS_MINT_WALLET_SEED,
): Promise<void> => {
  let wallet: WalletFacade | null = null;

  const targets = Array.isArray(receiverAddresses)
    ? receiverAddresses
    : [receiverAddresses];
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const networkUrls = resolveNetworkUrls();
      const networkId = resolveNetworkId();
      setNetworkId(networkId);
      console.log(
        `🔗 Building wallet with genesis seed for standalone mode... (attempt ${attempt})`,
      );

      const walletResult = await buildWalletFacade(
        networkUrls,
        seed,
        networkId,
      );
      wallet = walletResult.wallet;
      console.log("✅ Wallet built successfully");

      const initialState = await getInitialShieldedState(wallet.shielded);
      console.log(
        `Wallet address: ${initialState.address.coinPublicKeyString()}`,
      );
      console.log(`Unshielded address: ${walletResult.unshieldedAddress}`);
      console.log(`Dust address: ${walletResult.dustAddress}`);

      let { shieldedBalance, unshieldedBalance, dustBalance } =
        await syncAndWaitForFunds(wallet, {
          waitNonZero: false,
          logLabel: "faucet",
        });
      console.log(`Shielded balance: ${shieldedBalance}`);
      console.log(`Unshielded balance: ${unshieldedBalance}`);
      console.log(`Dust balance: ${dustBalance}`);

      if (unshieldedBalance === 0n) {
        try {
          unshieldedBalance = await waitForUnshieldedFunds(wallet, {
            timeoutMs: resolveWalletSyncTimeoutMs(),
          });
          console.log(`Unshielded balance (post-wait): ${unshieldedBalance}`);
        } catch (error) {
          throw new Error(
            `Unshielded balance is 0; cannot transfer NIGHT. ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (dustBalance === 0n && unshieldedBalance > 0n) {
        const registered = await registerNightForDust(walletResult);
        if (registered) {
          try {
            dustBalance = await waitForDustFunds(wallet, {
              timeoutMs: resolveWalletSyncTimeoutMs(),
            });
            console.log(`Dust balance (post-registration): ${dustBalance}`);
          } catch (_error) {
            console.warn("Dust still not available after registration; continuing");
          }
        }
      }

      let i = 1;
      while (targets.length > 0) {
        const receiverAddress = targets[0];
        const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
        console.log(`Using unshielded token id: ${tokenId}`);
        await transfer(walletResult, receiverAddress, tokenId, 1_000_000_000n);
        targets.splice(targets.indexOf(receiverAddress), 1);
        console.log(
          `✅ Successfully transferred Night tokens to [${i} of ${targets.length}] (attempt ${attempt}) ${receiverAddress}`,
        );
        i += 1;
      }
      console.log("✅ Successfully transferred Night tokens to all wallets");
      break;
    } catch (error) {
      console.error("❌ Error during join and mint process (0x2)", error);
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : error,
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
  const midnightAddress = Deno.env.get("MIDNIGHT_ADDRESS");
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error(
      "Example: MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts",
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
