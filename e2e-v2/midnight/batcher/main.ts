import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig, type DefaultBatcherInput } from "@effectstream/batcher";
import { ENV } from "@effectstream/utils/node-env";

import { midnightAdapter } from "./adapter-midnight.ts";

const batchIntervalMs = 1000;
const port = ENV.getNumber("BATCHER_PORT", 3334);

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: "",
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./e2e-v2-midnight-batcher-data");

const batcher = createNewBatcher(config, storage);

batcher.addBlockchainAdapter("midnight_eip20", midnightAdapter, {
  criteriaType: "size",
  maxBatchSize: 1,
});

main(function* () {
  console.log("Starting E2E-V2 Midnight Batcher...");
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
