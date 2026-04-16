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
import createUserTables from "./database/migrations/create-user-tables.sql" with { type: "text" };

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

// NearIntent: DIP-4 token_diff settlement event
stm.addStateTransition("intent-settled", function* (data) {
  const { account_id, intent_hash, token_diffs } = data.parsedInput;
  console.log(`[STM] intent-settled: account=${account_id} hash=${intent_hash} diffs=${JSON.stringify(token_diffs)}`);

  yield* World.promise(pool.query(
    "INSERT INTO near_intent_events (block_height, account_id, intent_hash, token_diffs) VALUES ($1, $2, $3, $4)",
    [data.blockHeight, account_id, intent_hash, JSON.stringify(token_diffs)],
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
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
      grammar,
    });
  });

  yield* suspend();
});
