import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@evm-cardano/database";

main(function* () {
  yield* init();
  console.log("Starting EVM-Cardano Sync Node (Local)");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "evm-cardano",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
