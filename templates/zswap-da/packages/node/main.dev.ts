// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// This side-effect import ensures the wasm bundle is registered.
import "@midnight-ntwrk/onchain-runtime-v3";

// NOTE: This is a fix for Midnight ZSwap.
import { ZswapChainState } from "@midnight-ntwrk/ledger-v8";

const origTryApply = ZswapChainState.prototype.tryApply;
ZswapChainState.prototype.tryApply = function (...args) {
  try {
    return origTryApply.apply(this as any, args as any);
  } catch {
    return [this, new Map()];
  }
};

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";

import { config } from "./config.dev.ts";
import { migrationTable } from "@zswap-da/database";
import { apiRouter } from "./api.ts";
import { gameStateTransitions } from "./state-machine.ts";
import { grammar } from "./grammar.ts";

main(function* () {
  yield* init();
  console.log("Starting ZSwap DA Node (Local)");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "zswap-da",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
