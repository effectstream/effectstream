// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// The next line is so that the wasm is loaded and not optimized away.
import { NetworkId } from "@midnight-ntwrk/onchain-runtime";
NetworkId.Undeployed;

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@e2e/data-types";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { migrationTable } from "@e2e/database";
import { gameStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { grammar } from "@e2e/data-types";
import { EvmCounterPrimitive } from "./custom-primitive.ts";

const userDefinedPrimitives = {
  'EVM:CUSTOM-COUNTER': EvmCounterPrimitive
};

main(function* () {
  yield* init();
  console.log("Starting Paima Engine Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "e2e-client",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives,
      snapshotConfig: Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")
        ? { interval: parseInt(Deno.env.get("PAIMA_SNAPSHOT_INTERVAL")!) }
        : undefined,
    });
  });

  yield* suspend();
});
