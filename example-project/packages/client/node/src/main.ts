import { init, start } from "@paimaexample/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@example/data-types";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paimaexample/config";
import { migrationRouter } from "@example/database";
import { gameStateTransitions } from "@example/state-transition";
import { apiRouter } from "@example/api";
import { grammar } from "@example/data-types";

main(function* () {
  yield* init();
  console.log("starting node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start({
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrationRouter,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
