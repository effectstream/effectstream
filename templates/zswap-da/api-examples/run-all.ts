// run-all.ts — Master coordinator. Runs all api-example scripts in series.
//
// Usage:
//   bun run api-examples/run-all.ts              # read-only: 01–06
//   WALLET_OPS=1 bun run api-examples/run-all.ts # also runs 08–11 (wallet + mint + offer + settle)
//
// The batcher and Midnight node cannot handle concurrent calls — every step
// runs sequentially, with a configurable pause between wallet operations.
//
// Env overrides (passed through to child scripts):
//   MIDNIGHT_NETWORK_ID  NODE_URL  BATCHER_URL
//   WALLET_SEED  TAKER_SEED  WALLET_OPS
//   GIVE_TOKEN  WANT_TOKEN  GIVE_AMOUNT  WANT_AMOUNT  TTL_MINUTES  MINT_AMOUNT

import { readFileSync } from "node:fs";
import { config, header, get } from "./config.ts";

const WALLET_OPS = process.env.WALLET_OPS === "1";
// Gap between wallet/chain operations — Midnight batcher queues serially.
const PAUSE_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(label: string, script: string, env: Record<string, string> = {}) {
  console.log(`\n${"▶".repeat(1)} ${label}`);
  const proc = Bun.spawn(
    ["bun", "run", script],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, ...env },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\n✗  ${label} exited with code ${code}`);
    if (process.env.FAIL_FAST === "1") process.exit(code);
  }
  return code === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
header(`ZSwap-DA API Examples — ${config.networkId.toUpperCase()}`);
console.log(`Node    : ${config.nodeUrl}`);
console.log(`Batcher : ${config.batcherUrl}`);
console.log(`Mode    : ${WALLET_OPS ? "read + wallet ops" : "read-only (set WALLET_OPS=1 for full run)"}`);

// ── Phase 1: Read-only — no chain interaction ─────────────────────────────────
await run("01 · Health check",       "api-examples/01-health.ts");
await run("02 · Known tokens",       "api-examples/02-tokens.ts");
await run("03 · Live offer book",    "api-examples/03-offers.ts");
await run("04 · Trading pairs",      "api-examples/04-pairs.ts");
await run("05 · Market data",        "api-examples/05-market.ts");
await run("06 · Midnight config",    "api-examples/06-midnight-config.ts");
// Note: 07-events.ts runs forever (SSE stream) — skip in run-all.

if (!WALLET_OPS) {
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("  Read-only phase complete.");
  console.log("  Run with WALLET_OPS=1 to also execute wallet + offer scripts.");
  process.exit(0);
}

// ── Phase 2: Wallet operations — sequential, pauses between each ──────────────
console.log("\n──────────────────────────────────────────────────────────────");
console.log("  Starting wallet operations (series — batcher is single-threaded)");
console.log("──────────────────────────────────────────────────────────────");

// Wallet inspection
await sleep(PAUSE_MS);
const walletOk = await run("08 · Wallet sync + balances", "api-examples/08-wallet.ts", {
  WALLET_SEED: config.walletSeed,
});
if (!walletOk) {
  console.error("Wallet sync failed — check WALLET_SEED and that the proof server is reachable.");
  process.exit(1);
}

// Mint test tokens (maker wallet → on-chain contract circuits)
// Domain separators are fixed so re-runs top up the same token colors.
await sleep(PAUSE_MS);
const mintOk = await run("09 · Mint test tokens", "api-examples/09-mint.ts", {
  WALLET_SEED: config.walletSeed,
});
if (!mintOk) {
  console.error("Mint failed — check WALLET_SEED has NIGHT for dust fees and proof server is reachable.");
  process.exit(1);
}

// Submit offer using the freshly minted tokens (maker wallet → Celestia via batcher)
await sleep(PAUSE_MS);
const submitOk = await run("10 · Build + submit offer", "api-examples/10-submit-offer.ts", {
  WALLET_SEED: config.walletSeed,
});
if (!submitOk) {
  console.error("Offer submission failed — check WALLET_SEED balance and node sync status.");
  process.exit(1);
}

// ── Confirm the offer is actually open before handing off to the settler ──────
// Script 10 writes /tmp/zswap-last-offer.json on success; re-check the status
// via the API here so we never launch the settler against a stale or missing offer.
console.log("\n── Confirming offer is open before settlement ──────────────────────");
let offerBlob = "";
try {
  const handoff = JSON.parse(readFileSync("/tmp/zswap-last-offer.json", "utf-8"));
  offerBlob = handoff.blob ?? "";
} catch {
  console.error("✗  /tmp/zswap-last-offer.json not found — script 10 may not have completed cleanly.");
  process.exit(1);
}

const { status: offerStatus } = await get<any>(
  `/api/zswap/status?blob=${encodeURIComponent(offerBlob)}`,
);
console.log(`   /api/zswap/status → "${offerStatus}"`);
if (offerStatus !== "open") {
  console.error(`✗  Offer is not open (status: "${offerStatus}"). Aborting settlement.`);
  process.exit(1);
}
console.log("✅  Offer confirmed open — proceeding to settlement.\n");

// Settle offer (taker wallet → Midnight)
await sleep(PAUSE_MS);
await run("11 · Settle offer on Midnight", "api-examples/11-settle-offer.ts", {
  TAKER_SEED: config.takerSeed,
  OFFER_BLOB: offerBlob,   // pin the exact offer — no guessing from the book
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════════");
console.log("  All steps complete.");
console.log("══════════════════════════════════════════════════════════════════");
