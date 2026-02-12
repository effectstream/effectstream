// Cleanup stale LevelDB BEFORE importing adapters (adapters initialize on import)
import path from "node:path";
import fs from "node:fs/promises";

const isEnvTrue = (key: string) => ["true", "1", "yes", "y"].includes((process.env[key] || "").toLowerCase());
const midnight_enabled = !isEnvTrue("DISABLE_MIDNIGHT");

if (midnight_enabled) {
  const baseDir = path.dirname(new URL(import.meta.url).pathname);
  
  // Clean up all midnight LevelDB directories (including process-specific ones from previous runs)
  try {
    for await (const entry of await fs.readdir(baseDir)) {
      const isDirectory = (await fs.stat(path.join(baseDir, entry))).isDirectory();
      if (isDirectory && entry.startsWith("midnight-level-db")) {
        const dbPath = path.join(baseDir, entry);
        try {
          await fs.rm(dbPath, { recursive: true });
          console.log(`🧹 Cleaned up stale Midnight LevelDB directory: ${entry}`);
        } catch (error) {
          console.warn(`⚠️ Could not clean up ${entry}:`, error);
        }
      }
    }
  } catch (error) {
    // Ignore if baseDir doesn't exist or can't be read
    if (!(error instanceof Deno.errors.NotFound)) {
      console.warn("⚠️ Error cleaning up LevelDB directories:", error);
    }
  }
}

// Now import adapters after cleanup
import { main, suspend } from "effection";
import { createNewBatcher } from "@effectstream/batcher";
import { config, storage } from "./config.ts";

import { bitcoinAdapter } from "./adapter-bitcoin.ts";
import { effectstreaml2Adapter } from "./adapter-effectstreaml2.ts";
import { midnightAdapter } from "./adapter-midnight.ts";
import {
  counterAdapter,
  counterAdapterTarget,
} from "./adapter-counter.ts";

const batcher = createNewBatcher(config, storage);
const batchIntervalMs = 1000;

const bitcoin_enabled = !isEnvTrue("DISABLE_BITCOIN");

batcher
  .addBlockchainAdapter("paimal2", effectstreaml2Adapter, { criteriaType: "time", timeWindowMs: batchIntervalMs })
  .addBlockchainAdapter(
    counterAdapterTarget,
    counterAdapter,
    { criteriaType: "size", maxBatchSize: 1 },
  )
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
