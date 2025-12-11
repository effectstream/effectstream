import { main, suspend } from "effection";
import { createNewBatcher } from "@effectstream/batcher";
import { config, storage, paimaL2Adapter, midnightAdapter, bitcoinAdapter } from "./config.ts";

const batcher = createNewBatcher(config, storage);
const batchIntervalMs = 1000;

const midnight_enabled = Deno
  ? (Deno.env.get("DISABLE_MIDNIGHT") === "true" ? false : true)
  : true;

const bitcoin_enabled = Deno
  ? (Deno.env.get("DISABLE_BITCOIN") === "true" ? false : true)
  : true;

batcher
  .addBlockchainAdapter("paimal2", paimaL2Adapter, { criteriaType: "time", timeWindowMs: batchIntervalMs })
  .setDefaultTarget("paimal2");

if (midnight_enabled) {
batcher
  .addBlockchainAdapter("midnight_eip20", midnightAdapter, { criteriaType: "size", maxBatchSize: 1 });
}

if (bitcoin_enabled) {
batcher
  .addBlockchainAdapter("bitcoin", bitcoinAdapter, { criteriaType: "hybrid", maxBatchSize: 5, timeWindowMs: batchIntervalMs });
}

// E2E-specific startup banner via state transition
batcher.addStateTransition("startup", ({ publicConfig }) => {
  const banner =
    `🧪 E2E Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
    `      | 📍 Default Target: ${publicConfig.defaultTarget}\n` +
    `      | ⛓️ Blockchain Adapter Targets: ${
      publicConfig.adapterTargets.join(", ")
    }\n` +
    `      | 📦 Batching Criteria: ${
      Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
        `${target}=${type}`
      ).join(", ")
    }\n` +
    `      | 📋 Press Ctrl+C to stop gracefully`;
  console.log(banner);
})
.addStateTransition("http:start", ({ port }) => {
  const publicConfig = batcher.getPublicConfig();
  const httpInfo = `🌐 HTTP Server started for E2E\n` +
    `      | URL: http://localhost:${port}\n` +
    `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
    `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
    `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
  console.log(httpInfo);
});

main(function* () {
  console.log("🚀 Starting Batcher...");
  try {
    // Run the batcher with Effection structured concurrency
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    // Trigger graceful shutdown on error
    yield* batcher.gracefulShutdownOp();
  }
  // Keep the main operation alive
  yield* suspend();
});
