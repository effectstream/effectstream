import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  MidnightBalancingAdapter,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";

import { batcherConfig } from "./config.ts";

const BALANCER_TARGET = "midnight-balancer";

const adapter = new MidnightBalancingAdapter(batcherConfig.walletSeed, {
  indexer: batcherConfig.midnight.indexer,
  indexerWS: batcherConfig.midnight.indexerWS,
  node: batcherConfig.midnight.node,
  proofServer: batcherConfig.midnight.proofServer,
  walletNetworkId: batcherConfig.midnight.id,
  syncProtocolName: "parallelMidnight",
});

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batcherConfig.pollingIntervalMs,
  enableHttpServer: true,
  namespace: "",
  confirmationLevel: "wait-receipt",
  enableEventSystem: false,
  port: batcherConfig.port,
};

const storage = new FileStorage(batcherConfig.storageDir);
const batcher = createNewBatcher(config, storage);

batcher.addBlockchainAdapter(BALANCER_TARGET, adapter, {
  criteriaType: "size",
  maxBatchSize: 1,
});

main(function* () {
  console.log(
    `[zswap-da-batcher] starting on :${batcherConfig.port} (target=${BALANCER_TARGET})`,
  );
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[zswap-da-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
