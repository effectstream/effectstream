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

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E-V2 Celestia Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-v2-celestia",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: [],
      grammar,
    });
  });

  yield* suspend();
});
