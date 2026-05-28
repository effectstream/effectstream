import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@dice/data-types/localhostConfig";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@dice/db";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@dice/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node - Dice Game");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "dice",
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
