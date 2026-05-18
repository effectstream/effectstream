import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig, type DefaultBatcherInput } from "@effectstream/batcher-sdk";
import { ENV } from "@effectstream/utils/node-env";
import { getWriteNamespace } from "@effectstream/config";

import { effectstreamL2Adapter } from "./adapter-effectstream-l2.ts";
import { counterAdapter, counterAdapterTarget } from "./adapter-counter.ts";
import { config as evmConfig } from "../config.ts";

const batchIntervalMs = 1000;
const port = ENV.getNumber("BATCHER_PORT", 3334);

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: getWriteNamespace(evmConfig.securityNamespace) ?? "",
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./e2e-batcher-data");

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("effectstream-l2", effectstreamL2Adapter, { criteriaType: "time", timeWindowMs: batchIntervalMs })
  .addBlockchainAdapter(counterAdapterTarget, counterAdapter, { criteriaType: "size", maxBatchSize: 1 })
  .setDefaultTarget("effectstream-l2");

main(function* () {
  console.log("Starting E2E EVM Batcher...");
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
