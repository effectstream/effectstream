import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import { ENV } from "@effectstream/utils/node-env";
import { getWriteNamespace } from "@effectstream/config";

import { solanaAdapter } from "./adapter-solana.ts";
import { config as solanaConfig } from "../config.ts";

const batchIntervalMs = 1000;
const port = ENV.getNumber("BATCHER_PORT", 3334);

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: getWriteNamespace(solanaConfig.securityNamespace) ?? "",
  // Submit + wait for on-chain receipt; the test asserts the sync indexed it
  // separately (decoupled from effectstream-processed nonce tracking).
  confirmationLevel: "wait-receipt",
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./e2e-solana-batcher-data");

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("solana", solanaAdapter, {
    criteriaType: "size",
    maxBatchSize: 1,
  })
  .setDefaultTarget("solana");

main(function* () {
  console.log("Starting E2E Solana Batcher...");
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
