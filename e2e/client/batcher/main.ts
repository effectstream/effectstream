import { main, suspend } from "effection";
import { PaimaBatcher } from "@paima/batcher";
import { config, storage } from "./config.ts";

const batcher = new PaimaBatcher(config, storage);

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
});

// E2E-specific http:start banner printing HTTP config
batcher.addStateTransition("http:start", ({ port }) => {
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
