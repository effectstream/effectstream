import { main, suspend } from "effection";
import {
  CelestiaAdapter,
  createNewBatcher,
  FileStorage,
  MidnightBalancingAdapter,
  type BatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";

import { batcherConfig, walletSeed } from "./config.ts";

const BALANCER_TARGET = "midnight-balancer";
const CELESTIA_TARGET = "celestia";

const adapter = new MidnightBalancingAdapter(walletSeed, {
  indexer: batcherConfig.midnight.indexer,
  indexerWS: batcherConfig.midnight.indexerWS,
  node: batcherConfig.midnight.node,
  proofServer: batcherConfig.midnight.proofServer,
  walletNetworkId: batcherConfig.midnight.id,
  syncProtocolName: "parallelMidnight",
});

const celestiaAdapter = new CelestiaAdapter({
  rpcUrl: batcherConfig.celestia.rpcUrl,
  namespace: batcherConfig.celestia.namespace,
  authToken: batcherConfig.celestia.authToken,
  network: batcherConfig.celestia.network,
  fee: batcherConfig.celestia.fee,
  gasLimit: batcherConfig.celestia.gasLimit,
  gasPrice: batcherConfig.celestia.gasPrice,
  gas: batcherConfig.celestia.gas,
  maxGasPrice: batcherConfig.celestia.maxGasPrice,
  txPriority: batcherConfig.celestia.txPriority,
  syncProtocolName: "parallelCelestia",
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

batcher.addBlockchainAdapter(CELESTIA_TARGET, celestiaAdapter, {
  criteriaType: "size",
  maxBatchSize: 1,
});

main(function* () {
  console.log(
    `[zswap-da-batcher] starting on :${batcherConfig.port} (targets=${BALANCER_TARGET}, ${CELESTIA_TARGET})`,
  );
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[zswap-da-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
