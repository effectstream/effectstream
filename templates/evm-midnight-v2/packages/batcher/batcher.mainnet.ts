import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createEffectstreamL2Adapter } from "./effectstream-l2.ts";
import { createMidnightBalancingAdapter } from "./midnight-balancing.ts";

const batcherPrivateKey = process.env.EVM_PRIVATE_KEY;
if (!batcherPrivateKey) {
  throw new Error("EVM_PRIVATE_KEY is required for mainnet batcher");
}

const batchIntervalMs = 1000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: 42161,
  contractModule: "PaimaL2ContractModule#MyPaimaL2Contract",
  privateKey: batcherPrivateKey,
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const midnight = createMidnightBalancingAdapter({
  networkId: "mainnet",
  syncProtocolName: "parallelMidnight",
});

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2, midnight },
  defaultTarget: "paimaL2",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
    midnight: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
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
