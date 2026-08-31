import { init, start } from "@effectstream/runtime";
import { main, spawn, suspend } from "effection";

import { config } from "./config.dev.ts";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@preorder/database";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "./grammar.ts";
import { BuyItemsPrimitive, ReferrerRewardPrimitive } from "./primitives.ts";
import { startNftDispatch } from "./nft-dispatch.ts";
main(function* () {
  yield* init();
  console.log("Starting Preorder Sync Node (Local)");

  // Drain nft_mints -> batcher. Spawn before start() (which never returns control).
  yield* spawn(startNftDispatch);

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "preorder",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives: {
        "EVM:BUY-ITEMS": BuyItemsPrimitive,
        "EVM:REFERRER-REWARD": ReferrerRewardPrimitive,
      },
    });
  });

  yield* suspend();
});
