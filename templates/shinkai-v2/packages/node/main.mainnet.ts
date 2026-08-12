import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { config } from "./config.mainnet.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@shinkai-v2/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "shinkai-v2",
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
