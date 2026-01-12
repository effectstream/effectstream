// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
import "@midnight-ntwrk/onchain-runtime";

import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { config as testnetConfig } from "@example-evm-midnight/data-types/config.testnet";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@example-evm-midnight/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@example-evm-midnight/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node (Testnet)");

  yield* withEffectstreamStaticConfig(testnetConfig, function* () {
    yield* start({
      appName: "evm-midnight-example",
      appVersion: "0.3.21",
      syncInfo: toSyncProtocolWithNetwork(testnetConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
