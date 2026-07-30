// Mint native unshielded M20 coins to each filler at startup, so fillers have
// M20 inventory available for M20→BTC swap fulfillment. Uses the new
// mint_unshielded circuit (FungibleToken-based mint() no longer exists).
//
// Called from the orchestrator's `mint-wallets-midnight` step after filler
// wallets have been created.

import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import * as Rx from "rxjs";
import {
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
import {
  buildWalletFacade,
  getInitialShieldedState,
  registerNightForDust,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import {
  SimpleToken,
  witnesses,
} from "@night-bitcoin/midnight-contract-unshielded-erc20";

const TAG = "[mint-m20-to-fillers]";
const log = {
  info: (...args: unknown[]) => console.log(TAG, ...args),
  warn: (...args: unknown[]) => console.warn(TAG, ...args),
  error: (...args: unknown[]) => console.error(TAG, ...args),
};

const sumBalances = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): bigint => {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    return Array.from(balances.values()).reduce(
      (acc, v) => acc + (v ?? 0n),
      0n,
    );
  }
  return Object.values(balances).reduce<bigint>(
    (acc, v) => acc + ((v as bigint) ?? 0n),
    0n,
  );
};

const balanceKeys = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): string[] => {
  if (!balances) return [];
  if (balances instanceof Map) return Array.from(balances.keys());
  return Object.keys(balances);
};

globalThis.WebSocket = WebSocket;

// Static per-template domain separator for the M20 unshielded token color.
// Must match the constants in packages/filler/index.ts and
// packages/frontend/client/src/contracts/erc20.ts.
const M20_DOMAIN_SEP = new Uint8Array(32).fill(0x20);

// Genesis seed used to fund the mint operations in standalone/undeployed mode.
// Holds initial NIGHT/dust on a fresh local Midnight node. MUST be a 64-char
// hex string (32 bytes) and MUST match faucet.ts's GENESIS_MINT_WALLET_SEED —
// any drift derives a different (empty) wallet and stalls sync for 10 minutes.
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));

// Compact compiler emits artifacts into `<pkg>/src/managed/{keys,zkir}/`.
// The provider then opens `${zkConfigPath}/keys/<circuit>.verifier` etc., so
// zkConfigPath must point at the directory containing those folders (not one
// level deeper).
const contractConfig = {
  privateStateStoreName: "unshielded-erc20-private-state",
  zkConfigPath: resolve(currentDir, "unshielded-erc20", "src", "managed"),
};

const standaloneConfig = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

// The new midnight-js-contracts API expects a `CompiledContract` (with the
// internal TypeId symbol attached), not a raw `new Contract(witnesses)`
// instance. Build it once and reuse — same pattern as the frontend's erc20.ts.
const compiledContract = CompiledContract.make(
  "unshielded-erc20",
  SimpleToken.Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses as never),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

async function getContractAddress(): Promise<string> {
  const file = resolve(currentDir, "unshielded-erc20.undeployed.json");
  try {
    const json = JSON.parse(await readFile(file, "utf-8"));
    console.log(`Using contract address from ${file}: ${json.contractAddress}`);
    return json.contractAddress;
  } catch (error) {
    console.error(`Failed to read contract address from ${file}:`, error);
    throw error;
  }
}

// Decode bech32m unshielded address (mn_addr_<network>1...) to its 32-byte
// UserAddress bytes — that's what mint_unshielded expects as the recipient.
function unshieldedToUserAddressBytes(unshieldedAddr: string): Uint8Array {
  if (!unshieldedAddr.startsWith("mn_addr_")) {
    throw new Error(
      `mint-m20-to-fillers: expected mn_addr_ bech32m unshielded address, got "${unshieldedAddr}"`,
    );
  }
  const parsed = MidnightBech32m.parse(unshieldedAddr);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
}

export async function mintM20ToFillers(
  unshieldedAddresses: string[],
  amount: bigint,
): Promise<void> {
  if (unshieldedAddresses.length === 0) {
    log.info("No filler addresses to mint to — skipping M20 pre-mint.");
    return;
  }

  setNetworkId(NetworkId.NetworkId.Undeployed);

  log.info("Step 1/5 — resolving deployed M20 contract address");
  const contractAddress = await getContractAddress();
  log.info(
    `Will mint ${amount} M20 to ${unshieldedAddresses.length} filler(s):`,
  );
  unshieldedAddresses.forEach((addr, i) => log.info(`  [${i + 1}] ${addr}`));

  log.info("Step 2/5 — building genesis wallet facade", {
    seed: `${GENESIS_MINT_WALLET_SEED.slice(0, 4)}…${GENESIS_MINT_WALLET_SEED.slice(-4)} (${GENESIS_MINT_WALLET_SEED.length} chars)`,
    node: standaloneConfig.node,
    indexer: standaloneConfig.indexer,
    proofServer: standaloneConfig.proofServer,
  });
  const walletResult = await buildWalletFacade(
    standaloneConfig,
    GENESIS_MINT_WALLET_SEED,
    NetworkId.NetworkId.Undeployed,
  );
  const wallet = walletResult.wallet;

  // Independent wallet-state subscription — surfaces actual balances and
  // sync flags every 5s so we can see if the wallet is being funded.
  // `syncAndWaitForFunds` has its own throttled logger too, but its line
  // doesn't include balance details for unshielded UTXOs by token id.
  const stateSub = wallet.state().subscribe({
    next: (state: any) => {
      const isSynced = state.isSynced ?? false;
      const shieldedDone =
        state.shielded?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
      const unshieldedDone =
        state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
      const dustDone =
        state.dust?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
      const shieldedKeys = balanceKeys(state.shielded?.balances);
      const unshieldedKeys = balanceKeys(state.unshielded?.balances);
      const shieldedSum = sumBalances(state.shielded?.balances);
      const unshieldedSum = sumBalances(state.unshielded?.balances);
      log.info("wallet-state", {
        isSynced,
        shieldedDone,
        unshieldedDone,
        dustDone,
        shieldedSum: shieldedSum.toString(),
        unshieldedSum: unshieldedSum.toString(),
        shieldedKeys,
        unshieldedKeys,
      });
    },
    error: (err: unknown) =>
      log.error("wallet.state() observable error:", err),
  });
  let observerSubs: Rx.Subscription[] = [stateSub];

  try {
    const initialState = await getInitialShieldedState(wallet.shielded);
    log.info("Genesis wallet derived addresses:", {
      shieldedCoinPubKey: initialState.address.coinPublicKeyString(),
      unshieldedAddress: walletResult.unshieldedAddress,
      dustAddress: walletResult.dustAddress,
    });

    // Custom sync wait: shielded + unshielded only, with non-zero unshielded.
    // We intentionally do NOT wait for `dust.progress.isStrictlyComplete()` —
    // after the faucet step registers NIGHT UTXOs and transfers NIGHT, the
    // dust subtree's progress tracker hangs in undeployed mode and never
    // reports complete, even with a fully-funded wallet. registerNightForDust
    // + the mint tx itself work fine without that flag flipping.
    log.info(
      "Step 3/5 — waiting for wallet sync (shielded + unshielded) and non-zero NIGHT balance",
    );
    const SYNC_TIMEOUT_MS = 120_000;
    const t0 = Date.now();
    const readyState: any = await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.filter((state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedDone =
            state.shielded?.state?.progress?.isStrictlyComplete?.() ??
            isSynced;
          const unshieldedDone =
            state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
          const unshieldedSum = sumBalances(state.unshielded?.balances);
          return shieldedDone && unshieldedDone && unshieldedSum > 0n;
        }),
        Rx.timeout({
          each: SYNC_TIMEOUT_MS,
          with: () =>
            Rx.throwError(
              () =>
                new Error(
                  `mint-m20: shielded+unshielded sync timeout after ${SYNC_TIMEOUT_MS}ms`,
                ),
            ),
        }),
      ),
    );
    const unshieldedBalance = sumBalances(readyState.unshielded?.balances);
    log.info(
      `Sync ready in ${((Date.now() - t0) / 1000).toFixed(1)}s — unshielded NIGHT: ${unshieldedBalance}`,
    );

    // Always try to register NIGHT for dust — this seeds the dust pool the
    // wallet uses to pay tx fees. Safe to call even if some dust already
    // exists from a prior faucet run (it just no-ops or re-registers).
    log.info(
      "Registering NIGHT UTXOs for dust generation (so we can pay tx fees)",
    );
    try {
      await registerNightForDust(walletResult);
      log.info("registerNightForDust completed");
    } catch (e) {
      log.warn(
        `registerNightForDust failed (continuing — mint will surface real fee errors if any): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    log.info("Step 4/5 — joining deployed M20 contract", { contractAddress });
    const providers = (await configureMidnightNodeProviders(
      walletResult.wallet,
      walletResult.zswapSecretKeys,
      walletResult.walletZswapSecretKeys,
      walletResult.dustSecretKey,
      walletResult.walletDustSecretKey,
      standaloneConfig,
      contractConfig.privateStateStoreName,
      contractConfig.zkConfigPath,
      walletResult.unshieldedKeystore,
    )) as any;

    const deployed = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: compiledContract as any,
      privateStateId: "simpleTokenPrivateState",
      initialPrivateState: {},
    });
    log.info(
      `Joined contract at ${deployed.deployTxData.public.contractAddress}`,
    );

    log.info(
      `Step 5/5 — minting ${amount} M20 to each of ${unshieldedAddresses.length} filler(s)`,
    );
    let i = 1;
    for (const addr of unshieldedAddresses) {
      const mintStart = Date.now();
      log.info(
        `[${i}/${unshieldedAddresses.length}] minting ${amount} M20 to ${addr}`,
      );
      const recipientBytes = unshieldedToUserAddressBytes(addr);
      // Pass Uint8Array directly — Array.from() would produce a plain JS array
      // which the Compact runtime rejects as Bytes<32>.
      const finalized = await (deployed.callTx as any).mint_unshielded(
        M20_DOMAIN_SEP,
        amount,
        { bytes: recipientBytes },
      );
      log.info(
        `[${i}/${unshieldedAddresses.length}] ✅ tx ${finalized.public.txId} block ${finalized.public.blockHeight} (${((Date.now() - mintStart) / 1000).toFixed(1)}s)`,
      );
      i += 1;
    }
    log.info("🎉 M20 pre-mint to fillers complete");
  } catch (err) {
    log.error(
      "FAILED:",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    if (err instanceof Error && err.stack) log.error(err.stack);
    throw err;
  } finally {
    for (const sub of observerSubs) sub.unsubscribe();
    await wallet.stop();
    log.info("Wallet stopped");
  }
}
