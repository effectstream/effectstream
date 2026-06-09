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
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";

import { config } from "./config.ts";
import { grammar } from "./grammar.ts";
import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

const stm = new Stm<typeof grammar, {}>(grammar);

const pool = getConnection();

stm.addStateTransition("solana-program-log", function* (data) {
  const { slot, programId, logMessages } = data.parsedInput;
  console.log(`[STM] solana-program-log: slot=${slot} program=${programId} logs=${logMessages.length}`);

  yield* World.promise(pool.query(
    "INSERT INTO solana_log_events (slot, program_id, log_messages) VALUES ($1, $2, $3)",
    [slot, programId, JSON.stringify(logMessages)],
  ));
});

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

main(function* () {
  yield* init();
  console.log("Starting E2E Solana Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-solana",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
      grammar,
    });
  });

  yield* suspend();
});
