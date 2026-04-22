import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig, type DefaultBatcherInput, BitcoinAdapter } from "@effectstream/batcher-sdk";

const batchIntervalMs = 1000;
const port = parseInt(process.env["BATCHER_PORT"] || "3334", 10);

const config: BatcherConfig<DefaultBatcherInput> = {
  pollingIntervalMs: batchIntervalMs,
  enableHttpServer: true,
  namespace: "",
  confirmationLevel: "wait-receipt",
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./e2e-v2-bitcoin-batcher-data");
const batcher = createNewBatcher(config, storage);

const bitcoinAdapter = new BitcoinAdapter({
  rpcUrl: "http://127.0.0.1:18443",
  rpcUser: "dev",
  rpcPass: "devpassword",
  seed: "my-super-secret-regtest-demo-seed-e2e",
});

batcher
  .addBlockchainAdapter("bitcoin", bitcoinAdapter, { criteriaType: "hybrid", maxBatchSize: 5, timeWindowMs: batchIntervalMs })
  .setDefaultTarget("bitcoin");

main(function* () {
  console.log("Starting E2E-V2 Bitcoin Batcher...");
  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }
  yield* suspend();
});
