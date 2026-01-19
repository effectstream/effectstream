import { parseArgs } from "@std/cli/parse-args";
import { main, suspend } from "effection";
import { createNewBatcher } from "@paimaexample/batcher";
import { config, storage } from "./config.ts";

const args = parseArgs(Deno.args, {
  string: ["btc-rpc-url", "btc-rpc-user", "btc-rpc-pass", "btc-seed", "midnight-seed", "storage-dir", "polling-interval"],
  alias: {
    p: "port",
  },
});

const batcher = createNewBatcher(config, storage);

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
