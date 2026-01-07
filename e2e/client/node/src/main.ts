// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// This side-effect import ensures the wasm bundle is registered.
import "@midnight-ntwrk/onchain-runtime";

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { config } from "@e2e/data-types/config-localhost";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@e2e/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@e2e/data-types";
import { EvmCounterPrimitive } from "./custom-primitive.ts";

const userDefinedPrimitives = {
  'EVM:CUSTOM-COUNTER': EvmCounterPrimitive
};

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-client",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives,
    });
  });

  yield* suspend();
});
