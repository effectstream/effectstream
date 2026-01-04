// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// The next line is so that the wasm is loaded and not optimized away.
import { NetworkId } from "@midnight-ntwrk/onchain-runtime";
NetworkId.Undeployed;


import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@[scope]/data-types/localhostConfig";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@[scope]/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@[scope]/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "[scope]",
      appVersion: "0.3.21",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives: {},
    });
  });

  yield* suspend();
});
