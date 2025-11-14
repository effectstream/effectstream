import { main, suspend } from "effection";
import { createNewBatcher } from "@paimaexample/batcher";
import {
  config,
  midnightAdapter,
  erc1155Adapter,
  storage,
} from "./config.ts";

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("evm", erc1155Adapter, { criteriaType: "size", maxBatchSize: 1 })
  .addBlockchainAdapter("midnight", midnightAdapter, { criteriaType: "size", maxBatchSize: 1 })
  .setDefaultTarget("midnight");

/** State transitions hooks for logging */
batcher
  .addStateTransition("startup", ({ publicConfig }) => {
    const banner =
      `🧱 Multi-Chain Token Transfer Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
      `      | 📍 Default Target: ${publicConfig.defaultTarget}\n` +
      `      | ⛓️ Blockchain Adapter Targets: ${
        publicConfig.adapterTargets.join(", ")
      }\n` +
      `      | 📦 Batching Criteria: ${
        Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
          `${target}=${type}`
        ).join(", ")
    }\n`;
    console.log(banner);
  })
  .addStateTransition("http:start", ({ port }) => {
    const publicConfig = batcher.getPublicConfig();
    const httpInfo = `🌐 HTTP Server ready\n` +
      `      | URL: http://localhost:${port}\n` +
      `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
      `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
      `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
    console.log(httpInfo);
  });

main(function* () {
  console.log("🚀 Starting EVM Midnight Template Batcher...");

  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
