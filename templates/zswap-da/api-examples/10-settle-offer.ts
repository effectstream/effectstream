// 10-settle-offer.ts — Take and settle an open offer on Midnight.
//
// What this does:
//   1. Fetches the first open offer from the book (or use OFFER_BLOB env var).
//   2. Builds the taker wallet (TAKER_SEED).
//   3. Calls wallet.balanceFinalizedTransaction() to produce a settlement tx.
//   4. Finalizes and submits to Midnight.
//   5. Polls the nullifier set until the offer is ARCHIVED (CONSUMED).
//
// Env overrides:
//   TAKER_SEED=<64-hex>     taker wallet seed (must have enough NIGHT for dust fees)
//   OFFER_BLOB=zswapoffer1… specific offer to settle; defaults to first open offer

import { config, get, header } from "./config.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer } from "mip-zswap-offer";

globalThis.WebSocket = WebSocket;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

header("Settle Offer");

// ── 1. Midnight config ────────────────────────────────────────────────────────
const midnightCfg = await get<any>("/api/midnight/config");
setNetworkId(midnightCfg.networkId as any);

const networkUrls = {
  id:          midnightCfg.networkId as any,
  indexer:     midnightCfg.indexerUri,
  indexerWS:   midnightCfg.indexerWsUri,
  node:        midnightCfg.indexerUri,
  proofServer: midnightCfg.proofServerUri,
};

// ── 2. Pick an offer ──────────────────────────────────────────────────────────
let blob = process.env.OFFER_BLOB ?? "";
let offerId: number | undefined;

if (!blob) {
  const offers = await get<any[]>("/api/zswaps?limit=1");
  if (offers.length === 0) {
    console.error("No open offers. Submit one first with 09-submit-offer.ts.");
    process.exit(1);
  }
  blob    = offers[0].transaction_hex;
  offerId = offers[0].id;
  console.log(`Using offer id=${offerId}  celestia=#${offers[0].celestia_height}`);
  console.log(`  gives: ${JSON.stringify(offers[0].gives)}`);
  console.log(`  wants: ${JSON.stringify(offers[0].wants)}\n`);
} else {
  console.log(`Using OFFER_BLOB (${blob.slice(0, 32)}…)\n`);
}

// ── 3. Build taker wallet ─────────────────────────────────────────────────────
console.log(`Building taker wallet (seed ${config.takerSeed.slice(0, 8)}…)…`);
const { wallet, zswapSecretKeys, dustSecretKey } =
  await buildWalletAndWaitForFunds(networkUrls, config.takerSeed, midnightCfg.networkId as any);
const keys = { shieldedSecretKeys: zswapSecretKeys, dustSecretKey };

// ── 4. Balance and finalize ───────────────────────────────────────────────────
console.log("Balancing settlement transaction (proving…)");
const offerTx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(blob));

const balRecipe = await (wallet as any).balanceFinalizedTransaction(offerTx, keys, {
  ttl: new Date(Date.now() + 30 * 60_000),
});
const settleTx = await wallet.finalizeRecipe(balRecipe);

// ── 5. Submit to Midnight ─────────────────────────────────────────────────────
console.log("Submitting settlement transaction to Midnight…");
await (wallet as any).submitTransaction(settleTx);

const txHash = settleTx.transactionHash?.().toString?.().slice(0, 24) ?? "(tx)";
console.log(`\n✅  Settlement submitted: ${txHash}…`);

// ── 6. Wait for offer to be archived ─────────────────────────────────────────
console.log("\nWaiting for offer to be archived (nullifier consumed)…");
for (let i = 0; i < 36; i++) {
  await sleep(5_000);
  const { status } = await get<any>(`/api/zswap/status?blob=${encodeURIComponent(blob)}`);
  console.log(`  status: ${status}`);
  if (status === "completed") {
    console.log("✅  Offer archived as CONSUMED — settlement confirmed.");
    break;
  }
  if (status === "expired" || status === "not_found") {
    console.log(`Offer ended with status: ${status}`);
    break;
  }
}

await wallet.stop().catch(() => {});
