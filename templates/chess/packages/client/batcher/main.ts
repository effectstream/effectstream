import { PaimaBatcher } from "@effectstream/batcher";
import { main, suspend } from "effection";
import { config, storage } from "./config.ts";

const batcher = new PaimaBatcher(config, storage);

main(function* () {
  console.log("🚀 Starting Batcher...");

  try {
    // Chess-specific startup banner via state transition
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `🧪 Chess Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
        `      | 📍 Default Target: ${publicConfig.defaultTarget}\n` +
        `      | ⛓️ Blockchain Adapter Targets: ${
          publicConfig.adapterTargets.join(", ")
        }\n` +
        `      | 📦 Batching Criteria: ${
          Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
            `${target}=${type}`
          ).join(", ")
        }`;
      console.log(banner);
    });

    // Chess-specific http:start banner printing HTTP config
    batcher.addStateTransition("http:start", ({ port }) => {
      const publicConfig = batcher.getPublicConfig();
      const httpInfo = `🌐 HTTP Server started for Chess\n` +
        `      | URL: http://localhost:${port}\n` +
        `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
        `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
        `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
      console.log(httpInfo);
    });

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
