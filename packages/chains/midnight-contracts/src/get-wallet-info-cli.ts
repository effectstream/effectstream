// CLI entry for inspecting a Midnight wallet (prints addresses, optional balances).
//
// Split out of get-wallet-info.ts so that module stays browser-bundle-safe:
// `parseArgs` (node:util) and `dotenv` are Node-only, top-level imports. Because
// get-wallet-info.ts is reachable from frontends (via @effectstream/wallets →
// @effectstream/midnight-contracts/wallet-info → buildWalletFacade), those
// imports broke the browser bundle ("No matching export ... for import parseArgs").
// The reusable wallet/dust helpers stay in get-wallet-info.ts; only this CLI lives here.
//
// Run: bun run src/get-wallet-info-cli.ts [--seed <hex>] [--balance]
import dotenv from "dotenv";
import { parseArgs } from "node:util";
import { nativeToken } from "@midnightntwrk/ledger-v9";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import * as Rx from "rxjs";
import type { NetworkUrls } from "./types.ts";
import { midnightNetworkConfig } from "./midnight-env.ts";
import { getEnv, args as getArgs, exit, isNotFoundError } from "@effectstream/utils/runtime";
import {
  buildWalletFacade,
  getInitialShieldedState,
  getInitialUnshieldedState,
  resolveWalletSyncTimeoutMs,
  syncAndWaitForFunds,
  resolveFacadeDustBalance,
  waitForDustFunds,
  registerNightForDust,
} from "./get-wallet-info.ts";

const log = console;

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
  const argSeed =
    typeof parsedArgs.seed === "string" ? parsedArgs.seed : undefined;
  let seed: string | undefined = argSeed || envSeed;

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

  const networkIdRaw = getEnv("MIDNIGHT_NETWORK_ID") || "undeployed";
  // NetworkId intentionally accepts future/custom IDs; preserve the selected
  // identifier instead of coercing supported IDs (for example qanet) to a
  // different network.
  const networkId = networkIdRaw.toLowerCase() as NetworkId.NetworkId;
  const networkUrls: Required<NetworkUrls> = {
    id: networkId,
    indexer,
    indexerWS,
    node,
    proofServer,
  };

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

      const tokenId = nativeToken().raw;
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
          dustBalance = resolveFacadeDustBalance(state, new Date());

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
