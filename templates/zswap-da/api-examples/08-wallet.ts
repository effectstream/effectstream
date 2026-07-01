// 08-wallet.ts — Build a Midnight wallet and print its address + balances.
// Requires: WALLET_SEED env var (hex, 64 chars) OR falls back to the dev
// genesis seed (only has funds on undeployed / local dev).
//
// On Preview/Mainnet you need a funded wallet seed:
//   MIDNIGHT_NETWORK_ID=preview bun mnemonic-to-seed.ts  # converts a 24-word phrase
//   export WALLET_SEED=<printed hex>
//   bun run api-examples/08-wallet.ts

import { config, header } from "./config.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { get } from "./config.ts";

globalThis.WebSocket = WebSocket;

header("Wallet");

// Midnight config is served by the node — no need to hard-code it.
const midnightCfg = await get<{
  contractAddress: string;
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  networkId: string;
}>("/api/midnight/config");

setNetworkId(midnightCfg.networkId as any);

const networkUrls = {
  id:          midnightCfg.networkId as any,
  indexer:     midnightCfg.indexerUri,
  indexerWS:   midnightCfg.indexerWsUri,
  node:        midnightCfg.indexerUri,          // Midnight node behind indexer
  proofServer: midnightCfg.proofServerUri,
};

console.log(`Building wallet for seed ${config.walletSeed.slice(0, 8)}… on ${midnightCfg.networkId}`);
console.log("(This syncs the wallet state from the indexer — may take a minute.)\n");

const { wallet, dustAddress, zswapSecretKeys, dustSecretKey } =
  await buildWalletAndWaitForFunds(networkUrls, config.walletSeed, midnightCfg.networkId as any);

const state = await wallet.shielded.waitForSyncedState();
const address = state.address.coinPublicKeyString();

console.log("─── Wallet ──────────────────────────────────────────────────────");
console.log(`  Shielded address : ${address}`);
console.log(`  Dust address     : ${dustAddress}`);

const balances: Record<string, bigint> = state.balances as any;
const STARS_PER_NIGHT = 1_000_000n;

if (Object.keys(balances).length === 0) {
  console.log("  Shielded balances: (none)");
} else {
  console.log("  Shielded balances:");
  for (const [color, amount] of Object.entries(balances)) {
    const night = color === "0000000000000000000000000000000000000000000000000000000000000000"
      ? `  (${(BigInt(amount as any) / STARS_PER_NIGHT).toString()} NIGHT)`
      : "";
    console.log(`    ${color.slice(0, 16)}…  ${amount}${night}`);
  }
}

console.log("\nKeys available for offer construction:");
console.log(`  zswapSecretKeys : ${zswapSecretKeys?.length ?? 0} key(s)`);
console.log(`  dustSecretKey   : ${dustSecretKey ? "yes" : "no"}`);

await wallet.stop().catch(() => {});
console.log("\n✅  Wallet synced and stopped cleanly.");
