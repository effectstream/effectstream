// TODO: Mainnet support is not yet wired up for night-bitcoin.
// Once mainnet endpoints are available, mirror the dev entrypoint with
// production-appropriate configuration from `./config.mainnet.ts`.
import "@midnight-ntwrk/onchain-runtime";

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";

import { config } from "./config.mainnet.ts";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@night-bitcoin/database";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "./grammar.ts";

main(function* () {
  yield* init();
  console.log("Starting EffectStream Node (Mainnet)");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "night-bitcoin",
      appVersion: "0.4.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives: {},
    });
  });

  yield* suspend();
});
