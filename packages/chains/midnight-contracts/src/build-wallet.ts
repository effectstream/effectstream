const log = console;
import { Buffer } from "node:buffer";

import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { nativeToken } from "@midnightntwrk/ledger-v9";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";

import { 
    buildWalletFacade,
    getInitialShieldedState, 
    resolveWalletSyncTimeoutMs, 
    syncAndWaitForFunds, 
    safeStringifyProgress
} from "./get-wallet-info.ts";

import type { WalletResult, NetworkUrls } from "./types.ts";
import type { InitialOwner } from "./types.ts";
import { getEnv } from "@effectstream/utils/runtime";

// ============================================================================
// Wallet Facade  
// ============================================================================

/**
 * Build wallet and wait for funds
 */
export async function buildWalletAndWaitForFunds(
    networkUrls: Required<NetworkUrls>,
    seed: string,
    networkId: NetworkId.NetworkId
  ): Promise<WalletResult> {
    log.info("Building wallet using modular SDK");
    const result = await buildWalletFacade(networkUrls, seed, networkId);
  
    const initialState = await getInitialShieldedState(result.wallet.shielded);
    const address = initialState.address.coinPublicKeyString();
    log.info(`Wallet seed: ${seed}`);
    log.info(`Wallet address: ${address}`);
    log.info(`Dust address: ${result.dustAddress}`);
  
    let balance = initialState.balances[nativeToken().raw] ?? 0n;
    console.log("initialState", safeStringifyProgress(initialState));
    const syncTimeoutMs = resolveWalletSyncTimeoutMs();
    if (balance === 0n) {
      const skipWait =
        getEnv("MIDNIGHT_SKIP_WAIT_FOR_FUNDS")?.toLowerCase() === "true";
      log.info("Wallet shielded balance: 0");
      log.info(
        `Waiting to receive tokens... (timeout ${syncTimeoutMs}ms${skipWait ? ", skip on timeout enabled" : ""})`
      );
      try {
        const { shieldedBalance, unshieldedBalance } = await syncAndWaitForFunds(
          result.wallet
        );
        balance = shieldedBalance;
        if (unshieldedBalance > 0n) {
          log.info(`Unshielded balance available: ${unshieldedBalance}`);
        }
      } catch (e) {
        if (skipWait) {
          log.warn(
            `Skipping wait for shielded funds after timeout: ${(e as Error).message}`
          );
        } else {
          throw e;
        }
      }
    }
    log.info(`Wallet balance: ${balance}`);
  
    // Dust syncing is handled by syncAndWaitForFunds above
    return result;
  }


  
// ============================================================================
// Contract Deployment Helpers
// ============================================================================

/**
 * Extract initial owner from wallet for contracts that need it (e.g., EIP-20)
 */
export async function extractInitialOwnerFromWallet(
wallet: WalletFacade
): Promise<InitialOwner> {
const initialState = await getInitialShieldedState(wallet.shielded);
const coinPubHex = initialState.address.coinPublicKeyString();
const encPubHex = initialState.address.encryptionPublicKeyString();
log.info(`Extracting initial owner from wallet keys (hex): coin=${coinPubHex}`);
log.info(`Encryption key (hex): ${encPubHex}`);

const coinBytes = Buffer.from(coinPubHex, "hex");
const encBytes = Buffer.from(encPubHex, "hex");

return {
    is_left: true,
    left: { bytes: coinBytes },
    right: { bytes: encBytes.subarray(0, 32) },
};
}
