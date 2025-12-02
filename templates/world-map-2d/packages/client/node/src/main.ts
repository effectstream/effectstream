import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@world-map-2d/data-types/localhostConfig";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import { migrationTable } from "@world-map-2d/db";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@world-map-2d/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node - World Map 2D");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "world-map-2d",
      appVersion: "0.1.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
