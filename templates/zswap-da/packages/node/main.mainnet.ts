// Side-effect import: registers the Midnight onchain-runtime wasm bundle.
import "@midnight-ntwrk/onchain-runtime-v3";

// Midnight ZSwap fix: swallow tryApply errors from already-spent inputs so the
// sync node doesn't crash on historic state.
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

import { config } from "./config.mainnet.ts";
import { migrationTable } from "@zswap-da/database";
import { apiRouter } from "./api.ts";
import { gameStateTransitions } from "./state-machine.ts";
import { grammar } from "./grammar.ts";

main(function* () {
  yield* init();
  console.log("Starting ZSwap DA Node (Mainnet)");

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
