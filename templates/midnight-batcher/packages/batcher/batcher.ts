// Midnight balancing batcher — target "midnight-balancer".
//
// Receives externally-built transactions (zswap/shielded transfers built with
// payFees:false, or contract-call txs captured at balanceTx time), balances
// their fees with the batcher wallet's dust, proves what still needs proving,
// and submits. Clients POST /send-input with:
//   { data: { target: "midnight-balancer", address, addressType: 5,
//             input: JSON.stringify({ tx: <hex>, txStage? }), timestamp } }

import { main, suspend } from "effection";
import {
  type BatcherConfig,
  createNewBatcher,
  type DefaultBatcherInput,
  FileStorage,
  MidnightBalancingAdapter,
} from "@effectstream/batcher-sdk";

import { batcherConfig, walletSeed } from "./config.ts";

export const BALANCER_TARGET = "midnight-balancer";

const adapter = new MidnightBalancingAdapter(walletSeed, {
  indexer: batcherConfig.midnight.indexer,
  indexerWS: batcherConfig.midnight.indexerWS,
  node: batcherConfig.midnight.node,
  proofServer: batcherConfig.midnight.proofServer,
  walletNetworkId: batcherConfig.midnight.id,
  syncProtocolName: BALANCER_TARGET,
  maxSlotsPerWallet: batcherConfig.maxSlotsPerWallet,
});

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batcherConfig.pollingIntervalMs,
  enableHttpServer: true,
  // No frontend and no sync node in this template; balancing inputs are
  // submitted unsigned (like night-bitcoin-v2's delegation flow).
  namespace: "midnight-batcher",
  confirmationLevel: "no-wait",
  enableEventSystem: false,
  port: batcherConfig.port,
};

const storage = new FileStorage(batcherConfig.storageDir);
const batcher = createNewBatcher(config, storage);

batcher.addBlockchainAdapter(BALANCER_TARGET, adapter, {
  criteriaType: "size",
  maxBatchSize: batcherConfig.maxBatchSize,
});

main(function* () {
  console.log(
    `[midnight-batcher] starting on :${batcherConfig.port} ` +
      `(target=${BALANCER_TARGET}, slots=${batcherConfig.maxSlotsPerWallet}, ` +
      `batchSize=${batcherConfig.maxBatchSize}, poll=${batcherConfig.pollingIntervalMs}ms)`,
  );
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("[midnight-batcher] error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
