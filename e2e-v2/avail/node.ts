import {
  init,
  start,
  type StartConfigGameStateTransitions,
} from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { PaimaSTM } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";

import { config } from "./config.ts";
import { grammar } from "./grammar.ts";

// ── State Machine ────────────────────────────────────────────────────────────

const stm = new PaimaSTM<typeof grammar, {}>(grammar);

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

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E-V2 Avail Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-v2-avail",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: [],
      grammar,
    });
  });

  yield* suspend();
});
