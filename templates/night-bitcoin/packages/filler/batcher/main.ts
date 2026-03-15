import { parseArgs } from "node:util";
import { main, suspend } from "effection";
import { createNewBatcher } from "@paimaexample/batcher";
import { buildBatcherSetup, FILLER_BATCHER_DEFAULTS } from "./config.ts";

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "btc-rpc-url": { type: "string" },
    "btc-rpc-user": { type: "string" },
    "btc-rpc-pass": { type: "string" },
    "btc-seed": { type: "string" },
    "midnight-seed": { type: "string" },
    "storage-dir": { type: "string" },
    "polling-interval": { type: "string" },
    "filler-name": { type: "string", default: "Balancing Batcher" },
    port: { type: "string", short: "p", default: "3334" },
  },
  strict: false,
});

const { config, storage, adapters } = buildBatcherSetup({
  fillerName: args["filler-name"],
  batcherPort: Number(args.port),
  pollingIntervalMs: Number(args["polling-interval"] ?? FILLER_BATCHER_DEFAULTS.pollingInterval),
  midnightSeed: args["midnight-seed"] ?? FILLER_BATCHER_DEFAULTS.midnightSeed,
  storageRoot: args["storage-dir"],
  bitcoin: {
    rpcUrl: args["btc-rpc-url"] ?? FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl,
    rpcUser: args["btc-rpc-user"] ?? FILLER_BATCHER_DEFAULTS.bitcoin.rpcUser,
    rpcPass: args["btc-rpc-pass"] ?? FILLER_BATCHER_DEFAULTS.bitcoin.rpcPass,
    seed: args["btc-seed"] ?? FILLER_BATCHER_DEFAULTS.bitcoin.seed,
  },
});

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("midnight", adapters.midnight, { criteriaType: "size", maxBatchSize: 1 })
  .addBlockchainAdapter("midnight_balancing", adapters.midnightBalancing, { criteriaType: "size", maxBatchSize: 1 })
  .addBlockchainAdapter("bitcoin", adapters.bitcoin, { criteriaType: "hybrid", maxBatchSize: 5, timeWindowMs: 1000 })
  .setDefaultTarget("midnight");

main(function* () {
  console.log("🚀 Starting Night Bitcoin Filler Batcher...");

  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      console.log(
        `🧱 Filler batcher startup - polling every ${publicConfig.pollingIntervalMs} ms`,
      );
      console.log(
        `      | Batcher HTTP: http://localhost:${publicConfig.port}`,
      );
      console.log(
        `      | Adapters: ${
          publicConfig.adapterTargets.join(", ")
        }; default=${publicConfig.defaultTarget}`,
      );
    });

    batcher.addStateTransition("http:start", ({ port }) => {
      console.log(
        `🌐 Filler batcher HTTP server ready at http://localhost:${port}`,
      );
    });

    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
