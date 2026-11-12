import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@rock-paper-scissors/data-types/localhostConfig";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@rock-paper-scissors/db";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@rock-paper-scissors/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node - Rock Paper Scissors");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "rock-paper-scissors",
      appVersion: "0.1.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
