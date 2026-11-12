import {
  init,
  start,
  type StartConfigAppStateTransitions,
} from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";

import { config } from "./config.ts";
import { grammar } from "./grammar.ts";
import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

// ── State Machine ────────────────────────────────────────────────────────────

const stm = new Stm<typeof grammar, {}>(grammar);

const pool = getConnection();

// CelestiaGeneric: payload.suppliedValue contains the blob content
stm.addStateTransition("celestia-blob", function* (data) {
  const { payload } = data.parsedInput;
  const content = payload.suppliedValue;
  console.log(`[STM] celestia-blob: ${content}`);

  yield* World.promise(pool.query(
    "INSERT INTO celestia_blobs (block_height, content) VALUES ($1, $2)",
    [data.blockHeight, content],
  ));
});

const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E Celestia Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-celestia",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
      grammar,
    });
  });

  yield* suspend();
});
