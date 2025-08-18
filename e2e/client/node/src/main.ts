import { init, start } from "@paima/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@e2e/data-types";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paima/config";
import { migrationRouter } from "@e2e/database";
import { gameStateTransitions } from "@e2e/state-transition";
import { apiRouter } from "@e2e/api";
import { grammar } from "@e2e/data-types";

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
