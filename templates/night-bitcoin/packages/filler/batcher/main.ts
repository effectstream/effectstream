import { parse } from "@std/flags";
import { main, suspend } from "effection";
import { createNewBatcher } from "@paimaexample/batcher";
import { buildBatcherSetup, FILLER_BATCHER_DEFAULTS } from "./config.ts";

const args = parse(Deno.args, {
  string: [
    "name",
    "port",
    "btc-rpc-url",
    "btc-rpc-user",
    "btc-rpc-pass",
    "btc-seed",
    "midnight-seed",
    "storage-dir",
    "polling-interval",
    "filler-port",
  ],
  alias: {
    n: "name",
    p: "port",
  },
});

const fillerName = (args.name ?? args._[0]) as string | undefined;
if (!fillerName) {
  throw new Error(
    'Missing filler name. Pass --name "<Filler Name>" or provide it as the first positional argument.',
  );
}

const batcherPortRaw = Number(args.port);
if (Number.isNaN(batcherPortRaw)) {
  throw new Error("--port must be a valid number.");
}
const batcherPort = batcherPortRaw;

const pollingIntervalMs = args["polling-interval"]
  ? Number(args["polling-interval"])
  : FILLER_BATCHER_DEFAULTS.pollingInterval;
if (Number.isNaN(pollingIntervalMs)) {
  throw new Error("--polling-interval must be a valid number when provided.");
}

const storageRoot = (args["storage-dir"] as string | undefined) ??
  FILLER_BATCHER_DEFAULTS.storageRoot;

const setup = buildBatcherSetup({
  fillerName,
  batcherPort,
  pollingIntervalMs,
  storageRoot,
  midnightSeed: (args["midnight-seed"] as string | undefined) ??
    FILLER_BATCHER_DEFAULTS.midnightSeed,
  bitcoin: {
    rpcUrl: (args["btc-rpc-url"] as string | undefined) ??
      FILLER_BATCHER_DEFAULTS.bitcoin.rpcUrl,
    rpcUser: (args["btc-rpc-user"] as string | undefined) ??
      FILLER_BATCHER_DEFAULTS.bitcoin.rpcUser,
    rpcPass: (args["btc-rpc-pass"] as string | undefined) ??
      FILLER_BATCHER_DEFAULTS.bitcoin.rpcPass,
    seed: (args["btc-seed"] as string | undefined) ??
      FILLER_BATCHER_DEFAULTS.bitcoin.seed,
  },
});

const batcher = createNewBatcher(setup.config, setup.storage);

batcher
  .addBlockchainAdapter("midnight", setup.adapters.midnight, {
    criteriaType: "size",
    maxBatchSize: 1,
  })
  .addBlockchainAdapter("bitcoin", setup.adapters.bitcoin, {
    criteriaType: "hybrid",
    timeWindowMs: 1000,
    maxBatchSize: 5,
  })
  .setDefaultTarget("midnight");

batcher
  .addStateTransition("startup", ({ publicConfig }) => {
    console.log(
      `🧱 Filler batcher startup (${fillerName}) - polling every ${publicConfig.pollingIntervalMs} ms`,
    );
    console.log(
      `      | Batcher HTTP: http://localhost:${publicConfig.port}`,
    );
    console.log(
      `      | Adapters: ${
        publicConfig.adapterTargets.join(", ")
      }; default=${publicConfig.defaultTarget}`,
    );
  })
  .addStateTransition("http:start", ({ port }) => {
    console.log(
      `🌐 ${fillerName} batcher HTTP server ready at http://localhost:${port}`,
    );
  });

main(function* () {
  console.log(
    `🚀 Starting batcher for filler "${fillerName}" on port ${batcherPort}`,
  );

  try {
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
