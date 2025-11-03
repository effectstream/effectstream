import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@chess/data-types/localhostConfig";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@chess/db";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@chess/data-types/grammar";

main(function* () {
  yield* init();
  console.log("Starting Chess Node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "chess-game",
      appVersion: "0.3.21",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
