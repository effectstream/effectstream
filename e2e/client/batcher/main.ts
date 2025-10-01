import { main, suspend } from "effection";
import { PaimaBatcher } from "@paima/batcher";
import { config, storage } from "./config.ts";

// Instantiate batcher
const batcher = new PaimaBatcher(storage, config);

// Align signature namespace with E2E (empty namespace)
batcher.namespace = "";

main(function* () {
  console.log("🚀 Starting Paima Batcher...");

  try {
    const publicConfig = batcher.getPublicConfig();
    console.log(
      `🎯 Batcher started - polling every ${publicConfig.pollingIntervalMs} ms
      | 📍 Default Target: ${publicConfig.defaultTarget}
      | ⛓️ Connector Targets: ${publicConfig.connectorTargets.join(", ")}
      | 📦 Batching Criteria: ${
        Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
          `${target}=${type}`
        ).join(", ")
      }
      ${
        publicConfig.enableHttpServer
          ? ` | 🌐 HTTP Server: http://localhost:${publicConfig.port}`
          : ""
      }
      | 📋 Press Ctrl+C to stop gracefully`,
    );

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
