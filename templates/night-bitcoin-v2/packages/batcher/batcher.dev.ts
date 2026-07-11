import { main, suspend } from "effection";
import {
  type BatcherConfig,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  MidnightBalancingAdapter,
} from "@effectstream/batcher-sdk";

import { batcherConfig, walletSeed } from "./config.ts";

// Frontend submits to this exact target name (see packages/frontend/client/src/interface.ts).
const BALANCER_TARGET = "midnight_balancing";

const adapter = new MidnightBalancingAdapter(walletSeed, {
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
    `[night-bitcoin-batcher] starting on :${batcherConfig.port} (target=${BALANCER_TARGET})`,
  );
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[night-bitcoin-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
