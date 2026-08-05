import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import { UnprovenTransactionRecipe, WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import {
  DustSecretKey,
  LedgerParameters,
  nativeToken,
  shieldedToken,
  UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v8";
import {
  InMemoryTransactionHistoryStorage,
  NetworkId,
  TransactionHistoryStorage,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { makeServerProvingService } from "@midnightntwrk/wallet-sdk-capabilities/proving";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import { getEnv, exit } from "@effectstream/utils/runtime";

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx bun faucet.ts
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
  networkId: NetworkId.NetworkId;
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
) {
  return {
    indexerClientConnection: {
      indexerHttpUrl: networkUrls.indexer,
      indexerWsUrl: networkUrls.indexerWS,
    },
    relayURL: new URL(networkUrls.node.replace("http", "ws")),
    networkId: networkId,
    costParameters: {
      additionalFeeOverhead: resolveDustFeeOverhead(),
      feeBlocksMargin: resolveDustFeeBlocksMargin(),
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryCommonSchema,
    ),
  };
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

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
  const unshieldedPublicKey = PublicKey.fromKeyStore(unshieldedKeystore);
  const dustParameters = LedgerParameters.initialParameters().dust;

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (config) => ShieldedWallet(config).startWithSeed(shieldedSeed),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(unshieldedPublicKey),
    dust: (config) => DustWallet(config).startWithSeed(dustSeed, dustParameters),
    provingService: () =>
      makeServerProvingService({
        provingServerUrl: new URL(networkUrls.proofServer),
      }),
  });

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const walletZswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  const walletDustSecretKey = DustSecretKey.fromSeed(dustSeed);

  await wallet.start(walletZswapSecretKeys, walletDustSecretKey);

  const dustState = await Rx.firstValueFrom(wallet.dust.state);

  return {
    wallet,
    zswapSecretKeys,
    walletZswapSecretKeys,
    dustSecretKey,
    walletDustSecretKey,
    dustAddress: MidnightBech32m.encode(networkId, dustState.address).asString(),
    unshieldedAddress,
    unshieldedKeystore,
    networkId,
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
  const envValue = getEnv("MIDNIGHT_WALLET_SYNC_TIMEOUT_MS");
  if (!envValue) return WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  console.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${WALLET_SYNC_TIMEOUT_MS}ms`,
  );
  return WALLET_SYNC_TIMEOUT_MS;
}

const resolveDustFeeBlocksMargin = (): number => {
  const envValue = getEnv("MIDNIGHT_DUST_FEE_BLOCKS_MARGIN");
  if (!envValue) return DUST_FEE_BLOCKS_MARGIN;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  console.warn(
    `Invalid MIDNIGHT_DUST_FEE_BLOCKS_MARGIN="${envValue}", using default ${DUST_FEE_BLOCKS_MARGIN}`,
  );
  return DUST_FEE_BLOCKS_MARGIN;
};

const resolveDustFeeOverhead = (): bigint => {
  const envValue = getEnv("MIDNIGHT_DUST_FEE_OVERHEAD");
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
  indexer: getEnv("MIDNIGHT_INDEXER_URL") || DEFAULT_NETWORK_URLS.indexer,
  indexerWS: getEnv("MIDNIGHT_INDEXER_WS_URL") ||
    DEFAULT_NETWORK_URLS.indexerWS,
  node: getEnv("MIDNIGHT_NODE_URL") || DEFAULT_NETWORK_URLS.node,
  proofServer: getEnv("MIDNIGHT_PROOF_SERVER_URL") ||
    DEFAULT_NETWORK_URLS.proofServer,
});

const resolveNetworkId = (): NetworkId.NetworkId => {
  const networkIdRaw = getEnv("MIDNIGHT_NETWORK_ID") || "undeployed";
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
    const parsedReceiverAddress = MidnightBech32m.parse(receiverAddress).decode(
      UnshieldedAddress,
      walletResult.networkId,
    );
    const recipe = await walletResult.wallet.transferTransaction(
      [{
        type: "unshielded",
        outputs: [{
          amount,
          type: tokenId,
          receiverAddress: parsedReceiverAddress,
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

export async function triggerNullifiers(
  networkUrls: Required<Config>,
  networkId: NetworkId.NetworkId,
): Promise<void> {
  console.log("\n--- Triggering nullifiers via shielded transfer ---\n");

  setNetworkId(networkId);

  const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_SEED, networkId);
  console.log("Genesis wallet built, waiting for funds...");

  await syncAndWaitForFunds(walletResult.wallet, {
    waitNonZero: true,
    logLabel: "genesis-nullifier",
    timeoutMs: 120_000,
  });

  const shieldedAddr = await walletResult.wallet.shielded.getAddress();
  const tokenId = shieldedToken().raw;
  console.log(`Doing shielded self-transfer (token: ${tokenId}) to trigger nullifier spend...`);

  const recipe = await walletResult.wallet.transferTransaction(
    [{
      type: "shielded",
      outputs: [{
        amount: 1n,
        type: tokenId,
        receiverAddress: shieldedAddr,
      }],
    }],
    {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    },
    { ttl: new Date(Date.now() + TTL_DURATION_MS) },
  );
  console.log("Shielded transfer recipe created");

  const signedTx = await walletResult.wallet.signUnprovenTransaction(
    recipe.transaction,
    (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
  );
  const finalizedTx = await walletResult.wallet.finalizeTransaction(signedTx);
  const txId = await walletResult.wallet.submitTransaction(finalizedTx);
  console.log(`Shielded transfer submitted, txId: ${txId} — nullifiers should be spent on-chain`);

  // Also test initSwap nullifiers
  console.log("\nTesting initSwap + balanceUnprovenTransaction nullifiers...");
  await performZswap(walletResult, "genesis-post-transfer");

  await walletResult.wallet.stop();
}

/** Outcome of a submitted zswap, with the exact zswap ledger event values it must produce. */
export interface ZswapResult {
  /** Wallet-reported transaction id (NOT the ledger event tx hash). */
  txId: string;
  /** Nullifiers of every shielded input in the swap tx, hex (no 0x), lowercase. */
  expectedNullifiers: string[];
  /** Commitments of every shielded output in the swap tx, hex (no 0x), lowercase. */
  expectedCommitments: string[];
}

const normalizeEventHex = (hex: string): string =>
  (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();

/**
 * Perform a zswap: initSwap creates a shielded swap offer,
 * balanceUnprovenTransaction completes it with the same wallet, and the
 * resulting transaction is signed, finalized and submitted.
 * Returns the tx id plus the exact nullifiers/commitments the chain must emit.
 */
async function performZswap(
  walletResult: Awaited<ReturnType<typeof buildWalletFacade>>,
  logLabel: string,
): Promise<ZswapResult> {
  await syncAndWaitForFunds(walletResult.wallet, {
    waitNonZero: true,
    logLabel,
    timeoutMs: 120_000,
  });

  const tokenId2 = shieldedToken().raw;
  const shieldedAddr2 = await walletResult.wallet.shielded.getAddress();

  console.log("Creating swap offer via initSwap...");
  const offerRecipe = await walletResult.wallet.initSwap(
    { shielded: { [tokenId2]: 1n } },
    [{
      type: "shielded",
      outputs: [{
        type: tokenId2,
        amount: 1n,
        receiverAddress: shieldedAddr2,
      }],
    }],
    {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    },
    { ttl: new Date(Date.now() + TTL_DURATION_MS) },
  );
  console.log("Swap offer created via initSwap");

  const balancedRecipe = await walletResult.wallet.balanceUnprovenTransaction(
    offerRecipe.transaction,
    {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    },
    { ttl: new Date(Date.now() + TTL_DURATION_MS) },
  );
  console.log("Swap balanced");

  const signedSwapTx = await walletResult.wallet.signUnprovenTransaction(
    balancedRecipe.transaction,
    (payload: Uint8Array) => walletResult.unshieldedKeystore.signData(payload),
  );
  const finalizedSwapTx = await walletResult.wallet.finalizeTransaction(signedSwapTx);

  // Read the exact nullifiers/commitments off the finalized tx: the ledger
  // emits one ZswapInput event per input (its nullifier) and one ZswapOutput
  // event per output (its commitment) when the tx is applied.
  const expectedNullifiers: string[] = [];
  const expectedCommitments: string[] = [];
  const offers = [
    finalizedSwapTx.guaranteedOffer,
    ...(finalizedSwapTx.fallibleOffer?.values() ?? []),
  ];
  for (const offer of offers) {
    if (!offer) continue;
    for (const input of offer.inputs) {
      expectedNullifiers.push(normalizeEventHex(input.nullifier));
    }
    for (const output of offer.outputs) {
      expectedCommitments.push(normalizeEventHex(output.commitment));
    }
  }

  const swapTxId = await walletResult.wallet.submitTransaction(finalizedSwapTx);
  console.log(
    `Swap submitted, txId: ${swapTxId} — expecting ` +
      `${expectedNullifiers.length} nullifier(s) ${JSON.stringify(expectedNullifiers)} and ` +
      `${expectedCommitments.length} commitment(s) ${JSON.stringify(expectedCommitments)} on-chain`,
  );
  return { txId: String(swapTxId), expectedNullifiers, expectedCommitments };
}

/**
 * Run a standalone zswap with the genesis wallet.  Used by the e2e suite to
 * verify the Midnight:NullifierAndCommitment primitive captures the swap's
 * zswap ledger events.  Returns the tx id and the exact expected
 * nullifiers/commitments.
 */
export async function triggerZswap(
  networkUrls: Required<Config>,
  networkId: NetworkId.NetworkId,
): Promise<ZswapResult> {
  console.log("\n--- Triggering zswap (initSwap + balance + submit) ---\n");

  setNetworkId(networkId);

  const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_SEED, networkId);
  console.log("Genesis wallet built, waiting for funds...");
  try {
    return await performZswap(walletResult, "genesis-zswap");
  } finally {
    await walletResult.wallet.stop();
  }
}

export async function triggerUnshieldedCreates(
  networkUrls: Required<Config>,
  networkId: NetworkId.NetworkId,
): Promise<void> {
  console.log("\n--- Triggering unshielded UTXO creates via unshielded self-transfer ---\n");

  setNetworkId(networkId);

  const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_SEED, networkId);
  console.log("Genesis wallet built, waiting for funds...");

  await syncAndWaitForFunds(walletResult.wallet, {
    waitNonZero: true,
    logLabel: "genesis-unshielded-create",
    timeoutMs: 120_000,
  });

  const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
  console.log(`Doing unshielded self-transfer (token: ${tokenId}) to trigger UTXO creation...`);
  const txId = await transfer(
    walletResult,
    walletResult.unshieldedAddress,
    tokenId,
    1_000_000n,
  );
  console.log(`Unshielded self-transfer submitted, txId: ${txId} — unshielded UTXOs should be created on-chain`);

  await walletResult.wallet.stop();
}

/** One expected unshielded spend: the exact identity of the consumed UTXO. */
export interface ExpectedUnshieldedSpend {
  /** Hash of the intent that CREATED the spent UTXO, hex (no 0x), lowercase. */
  intentHash: string;
  /** Output index within the creating intent's offer. */
  outputIndex: number;
  /** u128 value, decimal string. */
  value: string;
  /** Token type, hex (no 0x), lowercase. */
  tokenType: string;
}

/** Outcome of a submitted unshielded swap, with the exact marks it must produce. */
export interface UnshieldedSwapResult {
  /** Wallet-reported transaction id (NOT the ledger event tx hash). */
  txId: string;
  /** Exact identities of every unshielded UTXO the swap consumes. */
  expectedSpends: ExpectedUnshieldedSpend[];
  /** Decimal value of every unshielded UTXO the swap creates. */
  expectedCreateValues: string[];
  /**
   * intentHash candidates for the created UTXOs: for every intent in the
   * merged tx, its hash at its own segment and at segment 0 (guaranteed
   * offers execute in segment 0).
   */
  candidateIntentHashes: string[];
  /** Token types seen on the swap's outputs, hex (no 0x), lowercase. */
  expectedCreateTokenTypes: string[];
}

const normalizeUnshieldedHex = (hex: string): string =>
  (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();

/**
 * Perform an unshielded swap: initSwap declares an intent with unshielded
 * token deltas (an open offer — inputs it gives, outputs it wants), which is
 * then COMPLETED by a separate balancing intent produced via
 * balanceFinalizedTransaction and merged into the submitted transaction.
 *
 * There are no nullifiers/commitments for unshielded tokens: the canonical
 * mark of a spend/create is the (intentHash, outputIndex) pair of the UTXO's
 * creating intent. The expected marks are read off the final merged
 * transaction's intents before submission.
 */
export async function triggerUnshieldedSwap(
  networkUrls: Required<Config>,
  networkId: NetworkId.NetworkId,
): Promise<UnshieldedSwapResult> {
  console.log("\n--- Triggering unshielded swap (initSwap + balanceFinalizedTransaction) ---\n");

  setNetworkId(networkId);

  const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
  const walletResult = await buildWalletFacade(networkUrls, GENESIS_SEED, networkId);
  console.log("Genesis wallet built, waiting for funds...");

  try {
    await syncAndWaitForFunds(walletResult.wallet, {
      waitNonZero: true,
      logLabel: "genesis-unshielded-swap",
      timeoutMs: 120_000,
    });

    // Fees are paid in dust; a swap submitted without spendable dust is
    // rejected by the node (Invalid Transaction: Custom error: 168). The dust
    // observable is a lagging projection (other txs pay fees while it reads
    // 0), so this wait is advisory: log the balance, then attempt the swap.
    try {
      const dustBalance = await waitForDustFunds(walletResult.wallet, {
        waitNonZero: true,
        timeoutMs: 60_000,
      });
      console.log(`Dust balance before unshielded swap: ${dustBalance}`);
    } catch (e) {
      console.warn(`Dust balance not observed non-zero before swap (continuing): ${e}`);
    }

    const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
    const receiverAddress = MidnightBech32m.parse(walletResult.unshieldedAddress)
      .decode(UnshieldedAddress, walletResult.networkId);
    const ttl = () => new Date(Date.now() + TTL_DURATION_MS);
    const secretKeys = {
      shieldedSecretKeys: walletResult.walletZswapSecretKeys,
      dustSecretKey: walletResult.walletDustSecretKey,
    };
    const signSegment = (payload: Uint8Array) =>
      walletResult.unshieldedKeystore.signData(payload);

    // OFFER: want 1n of the token back, give 1n of the token — an intent with
    // unshielded deltas that another intent must complete.
    console.log(`Creating unshielded swap offer via initSwap (token: ${tokenId})...`);
    const offerRecipe = await walletResult.wallet.initSwap(
      { unshielded: { [tokenId]: 1n } },
      [{
        type: "unshielded",
        outputs: [{ type: tokenId, amount: 1n, receiverAddress }],
      }],
      secretKeys,
      { ttl: ttl() },
    );
    const signedOffer = await walletResult.wallet.signRecipe(offerRecipe, signSegment);
    const finalizedOffer = await walletResult.wallet.finalizeRecipe(signedOffer);
    console.log("Unshielded swap offer finalized");

    // COMPLETE: a separate balancing intent at a fresh segment (preserves the
    // offer intent's hash), merged into one transaction.
    const balancedRecipe = await walletResult.wallet.balanceFinalizedTransaction(
      finalizedOffer,
      secretKeys,
      { ttl: ttl() },
    );
    const signedBalanced = await walletResult.wallet.signRecipe(balancedRecipe, signSegment);
    const finalTx = await walletResult.wallet.finalizeRecipe(signedBalanced);
    console.log("Unshielded swap balanced (separate intent) and finalized");

    // Read the exact expected marks off the merged transaction's intents.
    const expectedSpends: ExpectedUnshieldedSpend[] = [];
    const expectedCreateValues: string[] = [];
    const expectedCreateTokenTypes: string[] = [];
    const candidateIntentHashes = new Set<string>();
    for (const [segmentId, intent] of finalTx.intents ?? new Map()) {
      candidateIntentHashes.add(normalizeUnshieldedHex(intent.intentHash(segmentId)));
      candidateIntentHashes.add(normalizeUnshieldedHex(intent.intentHash(0)));
      for (
        const offer of [
          intent.guaranteedUnshieldedOffer,
          intent.fallibleUnshieldedOffer,
        ]
      ) {
        if (!offer) continue;
        for (const spend of offer.inputs) {
          expectedSpends.push({
            intentHash: normalizeUnshieldedHex(spend.intentHash),
            outputIndex: spend.outputNo,
            value: spend.value.toString(),
            tokenType: normalizeUnshieldedHex(spend.type),
          });
        }
        for (const output of offer.outputs) {
          expectedCreateValues.push(output.value.toString());
          expectedCreateTokenTypes.push(normalizeUnshieldedHex(output.type));
        }
      }
    }

    const txId = await walletResult.wallet.submitTransaction(finalTx);
    console.log(
      `Unshielded swap submitted, txId: ${txId} — expecting ` +
        `${expectedSpends.length} spend(s) ${JSON.stringify(expectedSpends)} and ` +
        `${expectedCreateValues.length} create(s) with values ${JSON.stringify(expectedCreateValues)} ` +
        `across intents ${JSON.stringify([...candidateIntentHashes])}`,
    );
    return {
      txId: String(txId),
      expectedSpends,
      expectedCreateValues,
      expectedCreateTokenTypes,
      candidateIntentHashes: [...candidateIntentHashes],
    };
  } finally {
    await walletResult.wallet.stop();
  }
}

if (import.meta.main) {
  const midnightAddress = getEnv("MIDNIGHT_ADDRESS");
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error(
      "Example: MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx bun faucet.ts",
    );
    exit(1);
  }
  try {
    await faucet(midnightAddress);
    exit(0);
  } catch (error) {
    console.error("❌ Error during faucet process:", error);
    exit(1);
  }
}
