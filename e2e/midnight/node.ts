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

// -- State Machine ------------------------------------------------------------

const stm = new Stm<typeof grammar, {}>(grammar);

const pool = getConnection();

// MidnightGeneric (counter contract): writes parsed ledger payload to midnight_state
stm.addStateTransition("midnightContractState", function* (data) {
  const payload = data.parsedInput.payload;
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(`[STM] midnightContractState: ${payloadJson}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_state (block_height, primitive_name, payload_json) VALUES ($1, $2, $3)",
    [data.blockHeight, "midnightContractState", payloadJson],
  ));
});

// MidnightGeneric (eip-20 contract): writes parsed ledger payload to midnight_state
stm.addStateTransition("eip20ContractState", function* (data) {
  const payload = data.parsedInput.payload;
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(`[STM] eip20ContractState: ${payloadJson}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_state (block_height, primitive_name, payload_json) VALUES ($1, $2, $3)",
    [data.blockHeight, "eip20ContractState", payloadJson],
  ));
});

// MidnightNullifier: writes nullifier events to midnight_nullifiers
stm.addStateTransition("midnightNullifierState", function* (data) {
  const { payload } = data.parsedInput;
  const nullifier = payload?.nullifier ?? JSON.stringify(payload);
  const txHash = payload?.txHash ?? "";
  console.log(`[STM] midnightNullifierState: nullifier=${nullifier} txHash=${txHash}`);
  yield* World.promise(pool.query(
    "INSERT INTO midnight_nullifiers (block_height, nullifier, tx_hash) VALUES ($1, $2, $3) ON CONFLICT (nullifier) DO NOTHING",
    [data.blockHeight, nullifier, txHash],
  ));
});

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// -- Migrations ---------------------------------------------------------------

import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

const migrationTable: any[] = [
  { name: "create-user-tables", sql: createUserTables },
];

// -- Main ---------------------------------------------------------------------

main(function* () {
  yield* init();
  console.log("Starting E2E Midnight Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-midnight",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      migrations: migrationTable,
      grammar,
    });
  });

  yield* suspend();
});
