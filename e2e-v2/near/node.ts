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

// NearGeneric: payload contains the full NEP-297 event data
stm.addStateTransition("near-generic", function* (data) {
  const { payload } = data.parsedInput;
  console.log(`[STM] near-generic:`, JSON.stringify(payload));

  yield* World.promise(pool.query(
    "INSERT INTO near_events (block_height, content) VALUES ($1, $2)",
    [data.blockHeight, JSON.stringify(payload)],
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
  console.log("Starting E2E-V2 NEAR Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-v2-near",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: [],
      grammar,
    });
  });

  yield* suspend();
});
