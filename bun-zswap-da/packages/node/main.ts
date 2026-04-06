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

import { localhostConfig } from "./config.ts";
import { migrationTable } from "@zswap-da/database";
import { apiRouter } from "./api.ts";
import { gameStateTransitions, grammar } from "./state-machine.ts";

// ─── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting ZSwap DA Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "zswap-da",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
