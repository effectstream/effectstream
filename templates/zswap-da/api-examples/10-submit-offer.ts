// 10-submit-offer.ts — Build a ZSwap offer and submit it to Celestia via the node.
//
// What this does:
//   1. Syncs the maker wallet (WALLET_SEED) to find shielded balances.
//   2. Picks give/want tokens: GIVE_TOKEN/WANT_TOKEN env vars, or colors from
//      09-mint.ts output (/tmp/zswap-minted-tokens.json), or first two known tokens.
//   3. Calls wallet.initSwap() → finalizeTransaction() to produce a signed offer.
//   4. Encodes it as a zswapoffer1… blob.
//   5. POSTs to /api/zswap/submit (validates crypto + liveness, then forwards to batcher).
//   6. Polls /api/zswap/status until status = "open" (landed in Celestia + indexed).
//
// Env overrides:
//   WALLET_SEED=<64-hex>          maker wallet seed
//   GIVE_TOKEN=<64-hex>           token color to give
//   WANT_TOKEN=<64-hex>           token color to want
//   GIVE_AMOUNT=500000            amount in base units
//   WANT_AMOUNT=750000
//   TTL_MINUTES=30

import { readFileSync } from "node:fs";
import { config, get, post, header } from "./config.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { encodeOffer } from "mip-zswap-offer";

globalThis.WebSocket = WebSocket;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

header("Submit Offer");

// ── 1. Midnight config from node ──────────────────────────────────────────────
const midnightCfg = await get<any>("/api/midnight/config");
setNetworkId(midnightCfg.networkId as any);

const networkUrls = {
  id:          midnightCfg.networkId as any,
  indexer:     midnightCfg.indexerUri,
  indexerWS:   midnightCfg.indexerWsUri,
  node:        midnightCfg.indexerUri,
  proofServer: midnightCfg.proofServerUri,
};

// ── 2. Resolve give/want tokens ───────────────────────────────────────────────
// Priority: explicit env vars → colors from 09-mint.ts temp file → first two known tokens.
let GIVE_TOKEN = process.env.GIVE_TOKEN ?? "";
let WANT_TOKEN = process.env.WANT_TOKEN ?? "";

if (!GIVE_TOKEN || !WANT_TOKEN) {
  try {
    const minted = JSON.parse(readFileSync("/tmp/zswap-minted-tokens.json", "utf-8"));
    GIVE_TOKEN = GIVE_TOKEN || minted.shieldedA;
    WANT_TOKEN = WANT_TOKEN || minted.shieldedB;
    console.log("Using minted tokens from 09-mint.ts output.");
  } catch {
    const tokens = await get<any[]>("/api/known-tokens");
    if (tokens.length < 2) {
      console.error("Need at least 2 tokens. Run 09-mint.ts first, or set GIVE_TOKEN/WANT_TOKEN.");
      process.exit(1);
    }
    GIVE_TOKEN = GIVE_TOKEN || tokens[0].token_color;
    WANT_TOKEN = WANT_TOKEN || tokens[1].token_color;
    console.log("Using first two tokens from /api/known-tokens.");
  }
}
const GIVE_AMOUNT = BigInt(process.env.GIVE_AMOUNT ?? "500000");
const WANT_AMOUNT = BigInt(process.env.WANT_AMOUNT ?? "750000");
const TTL_MS      = (Number(process.env.TTL_MINUTES ?? "30")) * 60_000;

console.log(`Give : ${GIVE_AMOUNT} of ${GIVE_TOKEN.slice(0, 16)}…`);
console.log(`Want : ${WANT_AMOUNT} of ${WANT_TOKEN.slice(0, 16)}…`);
console.log(`TTL  : ${TTL_MS / 60_000} minutes`);
console.log(`Seed : ${config.walletSeed.slice(0, 8)}…\n`);

// ── 3. Build wallet ───────────────────────────────────────────────────────────
console.log("Syncing maker wallet…");
const { wallet, zswapSecretKeys, dustSecretKey } =
  await buildWalletAndWaitForFunds(networkUrls, config.walletSeed, midnightCfg.networkId as any);
const keys = { shieldedSecretKeys: zswapSecretKeys, dustSecretKey };

// ── 4. Verify balance ─────────────────────────────────────────────────────────
const state = await wallet.shielded.waitForSyncedState();
const balances: Record<string, bigint> = state.balances as any;
const available = balances[GIVE_TOKEN] ?? 0n;

console.log(`Maker balance of give-token: ${available}`);
if (available < GIVE_AMOUNT) {
  console.error(`Insufficient balance: have ${available}, need ${GIVE_AMOUNT}`);
  await wallet.stop().catch(() => {});
  process.exit(1);
}

// ── 5. Build offer ────────────────────────────────────────────────────────────
console.log("\nBuilding offer (proving…)");
const ttl = new Date(Date.now() + TTL_MS);
const address = state.address.coinPublicKeyString();

const recipe = await wallet.initSwap(
  { shielded: { [GIVE_TOKEN]: GIVE_AMOUNT } },
  [{ type: "shielded", outputs: [{ type: WANT_TOKEN, amount: WANT_AMOUNT, receiverAddress: address }] } as any],
  keys,
  { ttl, payFees: false },
);
const offerFinalized = await wallet.finalizeTransaction(recipe.transaction);
const blob = encodeOffer(offerFinalized.serialize());

console.log(`Encoded blob: ${blob.slice(0, 40)}…  (${blob.length} chars)`);

// ── 6. Submit to node ─────────────────────────────────────────────────────────
console.log("\nSubmitting to /api/zswap/submit…");
let submitResult: any;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    submitResult = await post("/api/zswap/submit", { blob });
    break;
  } catch (e: any) {
    if (e.message?.includes("ROOT_UNKNOWN") && attempt < 11) {
      console.log(`  ROOT_UNKNOWN — node may still be syncing; retrying in 10s… (${attempt + 1}/12)`);
      await sleep(10_000);
    } else {
      await wallet.stop().catch(() => {});
      throw e;
    }
  }
}

console.log("Submit result:", JSON.stringify(submitResult, null, 2));
const { txhash, height } = submitResult?.result ?? {};
console.log(`\n✅  Blob published to Celestia  txhash=${txhash}  height=${height}`);

// ── 7. Wait for indexer to pick it up ─────────────────────────────────────────
console.log("\nWaiting for offer to appear in the indexer…");
for (let i = 0; i < 30; i++) {
  await sleep(5_000);
  const { status } = await get<any>(`/api/zswap/status?blob=${encodeURIComponent(blob)}`);
  console.log(`  status: ${status}`);
  if (status === "open") {
    console.log("✅  Offer is live in the order book.");
    break;
  }
  if (status === "completed" || status === "expired") break;
}

await wallet.stop().catch(() => {});
console.log("\nBlob for settlement (copy for 10-settle-offer.ts):");
console.log(`  OFFER_BLOB="${blob}"`);
