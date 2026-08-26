const log = { info: console.log, warn: console.warn, error: console.error };
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";
import { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import {
  shieldedToken,
  nativeToken,
} from "@midnightntwrk/ledger-v9";
import { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";
import {
  buildWalletFacade as sdkBuildWalletFacade,
  getInitialShieldedState as sdkGetInitialShieldedState,
  registerNightForDust as sdkRegisterNightForDust,
  waitForDustFunds as sdkWaitForDustFunds,
} from "@effectstream/midnight-contracts/wallet-info";
import type { WalletResult as SdkWalletResult } from "@effectstream/midnight-contracts/types";

/**
 * This script transfers 10.0 dust from the default midnight wallet to a given address.
 * This works only on the local undeployed network.
 *
 * This is useful to pass dust to Lace wallets in the browser for testing purposes.
 *
 * Usage:
 * MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts
 *
 */

// ============================================================================
// Constants
// ============================================================================

/** Transaction TTL duration in milliseconds (1 hour) */
const TTL_DURATION_MS = 60 * 60 * 1000;

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

// Re-export the SDK-provided WalletResult so consumers (create-wallets.ts) keep their imports
export type WalletResult = SdkWalletResult;

// ============================================================================
// Wallet construction (delegated to SDK)
// ============================================================================

/**
 * Build a complete wallet facade with shielded, unshielded, and dust wallets.
 * Delegates to `@effectstream/midnight-contracts/wallet-info`'s `buildWalletFacade`,
 * which uses the new `WalletFacade.init({...})` API and ledger-v9.
 */
export async function buildWalletFacade(
  networkUrls: Required<Config>,
  seed: string,
  networkId: NetworkId.NetworkId
): Promise<WalletResult> {
  return sdkBuildWalletFacade(networkUrls, seed, networkId);
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
  return sdkGetInitialShieldedState(shieldedWallet) as Promise<ShieldedWalletState>;
}

/**
 * Resolve sync timeout from env or default.
 */
export function resolveWalletSyncTimeoutMs(): number {
  const envValue = process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS;
  if (!envValue) return WALLET_SYNC_TIMEOUT_MS;
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  log.warn(
    `Invalid MIDNIGHT_WALLET_SYNC_TIMEOUT_MS="${envValue}", using default ${WALLET_SYNC_TIMEOUT_MS}ms`
  );
  return WALLET_SYNC_TIMEOUT_MS;
}

const resolveNativeTokenId = (): string => {
  const token = nativeToken() as unknown as { raw?: string; tag?: string };
  if (typeof token === "string") return token;
  if (token && typeof token.tag === "string") return token.tag;
  if (token && typeof token.raw === "string") return token.raw;
  return String(token);
};

const sumUnshieldedBalances = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined
): bigint => {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    return Array.from(balances.values()).reduce((acc, v) => acc + (v ?? 0n), 0n);
  }
  return Object.values(balances).reduce((acc, v) => acc + (v ?? 0n), 0n);
};

const resolveUnshieldedTokenId = async (wallet: WalletFacade): Promise<string> => {
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
 * Wait for wallet to be synced and funded.
 *
 * Tracks shielded, unshielded, and dust sync progress using the new
 * v2 SDK state shape (`unshielded.progress.isStrictlyComplete()`).
 */
export async function syncAndWaitForFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number; waitNonZero?: boolean; logLabel?: string }
): Promise<{ shieldedBalance: bigint; unshieldedBalance: bigint; dustBalance: bigint }> {
  const logPrefix = options?.logLabel ? `[${options.logLabel}] ` : "";
  log.info(`${logPrefix}Waiting for wallet to sync and receive funds (shielded/dust)...`);

  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();
  const waitNonZero = options?.waitNonZero ?? false;
  let latestState: any = null;
  const periodicLogger = setInterval(() => {
    if (!latestState) return;
    const shieldedSynced =
      latestState.shielded?.state?.progress?.isStrictlyComplete?.() ??
      (latestState.isSynced ?? false);
    const dustSynced =
      latestState.dust?.state?.progress?.isStrictlyComplete?.() ??
      (latestState.isSynced ?? false);
    const unshieldedSynced =
      latestState.unshielded?.progress?.isStrictlyComplete?.() ??
      (latestState.isSynced ?? false);
    const shieldedBalances = latestState.shielded?.balances ?? {};
    const balanceKeys = Object.keys(shieldedBalances);

    const unshieldedBalanceLog = sumUnshieldedBalances(
      latestState.unshielded?.balances
    );

    log.info(
      `${logPrefix}[wait] shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} | shieldedKeys: [${balanceKeys.join(', ')}] | unshieldedBalance: ${unshieldedBalanceLog}`
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
            state.shielded?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
          const dustSynced =
            state.dust?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
          const unshieldedSynced =
            state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
          const tokenTag = shieldedToken().tag;
          const shieldedBalance = state.shielded?.balances?.[tokenTag] ?? 0n;
          const keys = Object.keys(state.shielded?.balances ?? {});

          const unshieldedBalanceLog = sumUnshieldedBalances(
            state.unshielded?.balances
          );

          log.info(
            `${logPrefix}Wallet sync progress: shielded=${shieldedSynced}, unshielded=${unshieldedSynced}, dust=${dustSynced} (isSynced: ${isSynced})`
          );
          log.info(
            `${logPrefix}Balance check: tokenTag=${tokenTag}, shieldedBal=${shieldedBalance}, unshieldedBal=${unshieldedBalanceLog}, availableKeys=[${keys.join(', ')}]`
          );
        }),
        Rx.filter((state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedSynced =
            state.shielded?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
          const dustSynced =
            state.dust?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
          const unshieldedSynced =
            state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;

          if (!shieldedSynced || !dustSynced || !unshieldedSynced) return false;

          if (waitNonZero) {
            const shieldedBalance = state.shielded?.balances?.[shieldedToken().tag] ?? 0n;

            const unshieldedBalanceCheck = sumUnshieldedBalances(
              state.unshielded?.balances
            );

            if (shieldedBalance > 0n || unshieldedBalanceCheck > 0n) {
               return true;
            }

            return false;
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

  const tokenTag = shieldedToken().tag;
  const shieldedBalance = (state as any).shielded?.balances?.[tokenTag] ?? 0n;

  // Handle unshielded balances
  const unshieldedBalances =
    ((state as any).unshielded?.balances as Map<string, bigint> | Record<string, bigint> | undefined);

  const unshieldedBalance = sumUnshieldedBalances(unshieldedBalances);

  let dustBalance = 0n;
  try {
    dustBalance = await waitForDustFunds(wallet, {
      timeoutMs: syncTimeoutMs,
      waitNonZero,
    });
  } catch (_err) {
    log.warn("Dust wallet did not report funds within timeout; continuing with dustBalance=0");
  }

  return { shieldedBalance, unshieldedBalance, dustBalance };
}

export async function waitForUnshieldedFunds(
  wallet: WalletFacade,
  options?: { timeoutMs?: number }
): Promise<bigint> {
  log.info("Waiting for unshielded wallet funds...");
  const syncTimeoutMs = options?.timeoutMs ?? resolveWalletSyncTimeoutMs();

  const balance = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(WALLET_SYNC_THROTTLE_MS),
      Rx.filter((state: any) => {
        const isSynced = state.isSynced ?? false;
        return state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
      }),
      Rx.map((state: any) => sumUnshieldedBalances(state.unshielded?.balances)),
      Rx.filter((value: bigint) => value > 0n),
      Rx.timeout({
        each: syncTimeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(`Unshielded wallet sync timeout after ${syncTimeoutMs}ms`)
          ),
      })
    )
  );

  return balance;
}

/**
 * Wait for dust wallet sync and return dust balance if available.
 *
 * Thin wrapper around `@effectstream/midnight-contracts` so this template picks
 * up façade heartbeat polling + dual `walletBalance` / `balance` reads while
 * still defaulting `timeoutMs` to this file’s resolver (which defaults to 5 minutes).
 */
export async function waitForDustFunds(
  wallet: WalletFacade,
  optionsOrTimeout?:
    | number
    | {
      timeoutMs?: number;
      waitNonZero?: boolean;
      dustPollIntervalMs?: number;
    },
): Promise<bigint> {
  if (optionsOrTimeout === undefined) {
    return sdkWaitForDustFunds(wallet, {
      timeoutMs: resolveWalletSyncTimeoutMs(),
    });
  }
  if (typeof optionsOrTimeout === "number") {
    return sdkWaitForDustFunds(wallet, optionsOrTimeout);
  }
  const { timeoutMs, ...rest } = optionsOrTimeout;
  return sdkWaitForDustFunds(wallet, {
    ...rest,
    timeoutMs: timeoutMs ?? resolveWalletSyncTimeoutMs(),
  });
}

/**
 * Register unshielded Night UTXOs for dust generation.
 *
 * Delegates to `@effectstream/midnight-contracts`: the SDK signs inside
 * `registerNightUtxosForDustGeneration`; the helper finalizes with `finalizeRecipe`
 * only (no `signRecipe` — transfers still use `signRecipe` + `finalizeRecipe`).
 */
export async function registerNightForDust(walletResult: WalletResult): Promise<boolean> {
  return sdkRegisterNightForDust(walletResult);
}

const resolveNetworkUrls = (): Required<Config> => ({
  indexer: process.env.MIDNIGHT_INDEXER_URL || DEFAULT_NETWORK_URLS.indexer,
  indexerWS: process.env.MIDNIGHT_INDEXER_WS_URL || DEFAULT_NETWORK_URLS.indexerWS,
  node: process.env.MIDNIGHT_NODE_URL || DEFAULT_NETWORK_URLS.node,
  proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL || DEFAULT_NETWORK_URLS.proofServer,
});

const resolveNetworkId = (): NetworkId.NetworkId => {
  const networkIdRaw = process.env.MIDNIGHT_NETWORK_ID || "undeployed";
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
      log.info("Using preview network (addresses will have mn_addr_preview prefix)");
      return "preview" as NetworkId.NetworkId;
    default:
      log.warn(
        `Unknown network ID "${networkIdRaw}", using as-is. Valid values: undeployed, testnet, devnet, preview`
      );
      return networkIdRaw as NetworkId.NetworkId;
  }
};

/**
 * Transfer unshielded NIGHT tokens to a bech32m address using the v2.x
 * `transferTransaction` -> `signRecipe` -> `finalizeRecipe` -> `submitTransaction` flow.
 */
const transfer = async (
  walletResult: WalletResult,
  receiverAddressString: string,
  tokenId: string,
  amount: bigint = 1_000_000_000n,
  networkId: NetworkId.NetworkId
): Promise<string> => {
  console.log(`Transferring ${amount} to ${receiverAddressString} (tokenId=${tokenId})`);

  try {
    const ttl = new Date(Date.now() + TTL_DURATION_MS);

    // Decode the bech32m unshielded address to an UnshieldedAddress instance
    const receiverAddress = UnshieldedAddress.codec.decode(
      networkId,
      MidnightBech32m.parse(receiverAddressString)
    );

    const recipe = await walletResult.wallet.transferTransaction(
      [
        {
          type: "unshielded",
          outputs: [
            {
              type: tokenId,
              receiverAddress,
              amount,
            },
          ],
        },
      ],
      {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      },
      { ttl, payFees: true }
    );
    console.log("✓ Transfer transaction recipe created");

    const signedRecipe = await walletResult.wallet.signRecipe(
      recipe,
      (payload: Uint8Array) => walletResult.unshieldedKeystore.signDataAsync(payload)
    );
    console.log("✓ Transfer transaction signed");

    const finalizedTx = await walletResult.wallet.finalizeRecipe(signedRecipe);
    console.log("✓ Transfer transaction finalized");

    const txId = await walletResult.wallet.submitTransaction(finalizedTx);
    console.log({ txId });
    console.log(`✅ Successfully transferred Night tokens to ${receiverAddressString}`);
    return String(txId);
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

  // Copy the input; the while/splice loop below mutates `targets`, and we
  // don't want to drain the caller's array (mint-wallets.ts passes the same
  // array into mintM20ToFillers right after this).
  const targets = Array.isArray(receiverAddresses)
    ? [...receiverAddresses]
    : [receiverAddresses];
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const networkUrls = resolveNetworkUrls();
      const networkId = resolveNetworkId();
      setNetworkId(networkId);
      console.log(
        `🔗 Building wallet with genesis seed for standalone mode... (attempt ${attempt})`
      );

      const walletResult = await buildWalletFacade(
        networkUrls,
        seed,
        networkId
      );
      wallet = walletResult.wallet;
      console.log("✅ Wallet built successfully");

      const initialState = await getInitialShieldedState(wallet.shielded);
      console.log(`Wallet address: ${initialState.address.coinPublicKeyString()}`);
      console.log(`Unshielded address: ${walletResult.unshieldedAddress}`);
      console.log(`Dust address: ${walletResult.dustAddress}`);

      let { shieldedBalance, unshieldedBalance, dustBalance } = await syncAndWaitForFunds(wallet, {
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
            }`
          );
        }
      }

      if (dustBalance === 0n && unshieldedBalance > 0n) {
        const registered = await registerNightForDust(walletResult);
        if (registered) {
          try {
            dustBalance = await waitForDustFunds(wallet, { timeoutMs: resolveWalletSyncTimeoutMs() });
            console.log(`Dust balance (post-registration): ${dustBalance}`);
          } catch (_error) {
            log.warn("Dust still not available after registration; continuing");
          }
        }
      }

      let i = 1;
      while (targets.length > 0) {
        const receiverAddress = targets[0];
        const tokenId = await resolveUnshieldedTokenId(walletResult.wallet);
        console.log(`Using unshielded token id: ${tokenId}`);
        // 1000 NIGHT (1e12 base units) — large enough that virtual dust
        // accrues quickly on each filler's UTXO, so the filler can fee-fund
        // its own dust-registration tx after a short aging wait (see
        // register-filler-dust.ts). 1 NIGHT was too low; the registration
        // tx made it into the mempool but the block producer never picked
        // it up because the implied fee from virtual dust was ~0.
        await transfer(walletResult, receiverAddress, tokenId, 1_000_000_000_000n, networkId);
        targets.splice(targets.indexOf(receiverAddress), 1);
        console.log(
          `✅ Successfully transferred Night tokens to [${i} of ${targets.length}] (attempt ${attempt}) ${receiverAddress}`
        );
        i += 1;
      }
      console.log("✅ Successfully transferred Night tokens to all wallets");
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
  const midnightAddress = process.env.MIDNIGHT_ADDRESS;
  if (!midnightAddress) {
    console.error("❌ MIDNIGHT_ADDRESS environment variable is not set");
    console.error(
      "Example: MIDNIGHT_ADDRESS=mn_addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx deno run -A faucet.ts"
    );
    process.exit(1);
  }
  try {
    await faucet(midnightAddress);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during faucet process:", error);
    process.exit(1);
  }
}
