// run-all.ts — Master coordinator. Runs all api-example scripts in series.
//
// Usage:
//   bun run api-examples/run-all.ts              # read-only: 01–06
//   WALLET_OPS=1 bun run api-examples/run-all.ts # also runs 08–10 (wallet + offer + settle)
//
// The batcher and Midnight node cannot handle concurrent calls — every step
// runs sequentially, with a configurable pause between wallet operations.
//
// Env overrides (passed through to child scripts):
//   MIDNIGHT_NETWORK_ID  NODE_URL  BATCHER_URL
//   WALLET_SEED  TAKER_SEED  WALLET_OPS
//   GIVE_TOKEN  WANT_TOKEN  GIVE_AMOUNT  WANT_AMOUNT  TTL_MINUTES

import { config, header } from "./config.ts";

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

// Submit offer (maker wallet → Celestia via batcher)
await sleep(PAUSE_MS);
const submitOk = await run("09 · Build + submit offer", "api-examples/09-submit-offer.ts", {
  WALLET_SEED: config.walletSeed,
});
if (!submitOk) {
  console.error("Offer submission failed — check WALLET_SEED balance and node sync status.");
  process.exit(1);
}

// Settle offer (taker wallet → Midnight)
await sleep(PAUSE_MS);
await run("10 · Settle offer on Midnight", "api-examples/10-settle-offer.ts", {
  TAKER_SEED: config.takerSeed,
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════════");
console.log("  All steps complete.");
console.log("══════════════════════════════════════════════════════════════════");
