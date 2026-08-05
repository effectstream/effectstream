import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createEffectstreamL2Adapter } from "./effectstream-l2.ts";

const batchIntervalMs = 1000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: 31337,
  contractModule: "EffectstreamL2Module#MyEffectstreamL2",
  privateKey: process.env.EVM_PRIVATE_KEY ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2 },
  defaultTarget: "paimaL2",
  // Must match the node's setSecurityNamespace(...) and the frontend's
  // EffectstreamConfig namespace — the sync-side L2 primitive re-verifies
  // batched signatures against only the configured namespace.
  namespace: "chess-v2",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  console.log("Starting Chess Batcher...");

  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `Chess Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
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
