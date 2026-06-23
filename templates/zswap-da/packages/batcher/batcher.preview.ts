/**
 * Preview-network batcher: Midnight balancer + Celestia DA.
 *
 * Requires MIDNIGHT_NETWORK_ID=preview and BATCHER_WALLET_SEED set to a hex
 * seed for a wallet that has dust on Midnight Preview. Use mnemonic-to-seed.ts
 * to derive the seed from a 24-word phrase, then set BATCHER_WALLET_SEED in .env.
 */
import { main, suspend } from "effection";
import {
  createNewBatcher,
  FileStorage,
  type BatcherConfig as SdkBatcherConfig,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";

import { loadBatcherConfig } from "./config.ts";
import { createMidnightBalancingAdapter } from "./midnight-balancing.ts";
import { createCelestiaAdapter } from "./celestia.ts";

const BALANCER_TARGET = "midnight-balancer";
const CELESTIA_TARGET = "celestia";

const batcherConfig = loadBatcherConfig();
if (batcherConfig.midnight.id !== "preview") {
  throw new Error(
    `batcher.preview.ts requires MIDNIGHT_NETWORK_ID=preview, got "${batcherConfig.midnight.id}"`,
  );
}
const midnightAdapter = createMidnightBalancingAdapter(batcherConfig);
const celestiaAdapter = createCelestiaAdapter(batcherConfig);

const sdkConfig: SdkBatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batcherConfig.pollingIntervalMs,
  enableHttpServer: true,
  namespace: "",
  confirmationLevel: "wait-receipt",
  enableEventSystem: false,
  port: batcherConfig.port,
};

const storage = new FileStorage(batcherConfig.storageDir);
const batcher = createNewBatcher(sdkConfig, storage);

batcher.addBlockchainAdapter(BALANCER_TARGET, midnightAdapter, {
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
