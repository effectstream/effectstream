// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// This side-effect import ensures the wasm bundle is registered.
import "@midnight-ntwrk/onchain-runtime";

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import { config } from "@e2e/data-types/config-localhost";
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

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-client",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
      userDefinedPrimitives,
      // -----------------------------------------------------------------------
      // Snapshot configuration (optional — only active when env vars are set).
      //
      // All fields are optional. An empty object {} uses all defaults:
      //   interval  → 100 blocks
      //   path      → ./snapshots
      //   retention → tiered time-based policy (1h/6h/daily)
      //
      // Override via environment variables:
      //   EFFECTSTREAM_SNAPSHOT_INTERVAL               – block interval
      //   EFFECTSTREAM_SNAPSHOT_PATH                   – output directory
      //   EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY        – "false" to disable hourly tier
      //   EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY – "false" to disable 6-hour tier
      //   EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS            – number of daily-retention days
      //
      // Restore a snapshot:
      //   pg_restore -h localhost -p 5432 -U postgres -d postgres --clean snapshot-N.dump
      // -----------------------------------------------------------------------
      snapshotConfig: Deno.env.get("EFFECTSTREAM_SNAPSHOT_INTERVAL")
        ? {
            interval: parseInt(Deno.env.get("EFFECTSTREAM_SNAPSHOT_INTERVAL")!),
            path: Deno.env.get("EFFECTSTREAM_SNAPSHOT_PATH") ?? "./snapshots",
            retention: {
              lastDayHourly:
                Deno.env.get("EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY") !== "false",
              last3DaysSixHourly:
                Deno.env.get("EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY") !== "false",
              lastNDaysDaily: Deno.env.get("EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS")
                ? parseInt(Deno.env.get("EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS")!)
                : undefined, // undefined → default of 7 inside snapshot-handler
            },
          }
        : undefined,
    });
  });

  yield* suspend();
});
