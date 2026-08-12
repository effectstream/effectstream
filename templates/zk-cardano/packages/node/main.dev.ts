await import("@midnight-ntwrk/onchain-runtime");

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";

import { config } from "./config.dev.ts";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@zk-cardano/database";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "./grammar.ts";

main(function* () {
  yield* init();
  console.log("Starting ZK Cardano Node (Local)");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "zk-cardano",
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
