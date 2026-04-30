import { main, suspend } from "effection";
import { createNewBatcher } from "@effectstream/batcher-sdk";
import { config, storage } from "./config.mainnet.ts";

const batcher = createNewBatcher(config, storage);

main(function* () {
  console.log("Starting EVM Midnight Template Batcher (Mainnet)...");

  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `EVM Midnight Template Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
        `      | Default Target: ${publicConfig.defaultTarget}\n` +
        `      | Blockchain Adapter Targets: ${
          publicConfig.adapterTargets.join(", ")
        }\n` +
        `      | Batching Criteria: ${
          Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
            `${target}=${type}`
          ).join(", ")
        }\n`;
      console.log(banner);
    });

    batcher.addStateTransition("http:start", ({ port }) => {
      const publicConfig = batcher.getPublicConfig();
      const httpInfo = `HTTP Server ready\n` +
        `      | URL: http://localhost:${port}\n` +
        `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
        `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
        `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
      console.log(httpInfo);
    });

    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
