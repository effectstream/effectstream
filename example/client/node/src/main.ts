import { init, start } from "@paima/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@example/data-types";
import {
  type SyncProtocolWithNetwork,
  toSyncProtocolWithNetwork,
  withPaimaStaticConfig,
} from "@paima/config";

main(function* () {
  yield* init();
  console.log("starting node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start(
      toSyncProtocolWithNetwork(localhostConfig),
    );
  });

  yield* suspend();
});
