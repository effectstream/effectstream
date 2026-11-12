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

// AvailGeneric: payload.suppliedValue contains the submitted JSON string
stm.addStateTransition("avail-app-state", function* (data) {
  const { payload } = data.parsedInput;
  const suppliedValue = payload.suppliedValue;
  console.log(`[STM] avail-app-state: ${suppliedValue}`);

  // Parse the JSON to extract the message field
  let message = suppliedValue;
  try {
    const parsed = JSON.parse(suppliedValue);
    if (parsed.message) {
      message = parsed.message;
    }
  } catch {
    // If not valid JSON, store the raw value
  }

  yield* World.promise(pool.query(
    "INSERT INTO avail_messages (height, message) VALUES ($1, $2)",
    [data.blockHeight, message],
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
  console.log("Starting E2E Avail Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-avail",
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
