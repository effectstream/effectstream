import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";

import { config } from "./config.dev.ts";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@preorder/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "./grammar.ts";
import { BuyItemsPrimitive } from "./primitives.ts";
main(function* () {
  yield* init();
  console.log("Starting Preorder Sync Node (Local)");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "preorder",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives: {
        "EVM:BUY-ITEMS": BuyItemsPrimitive,
      },
    });
  });

  yield* suspend();
});
