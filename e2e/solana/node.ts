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

stm.addStateTransition("solana-account-balance", function* (data) {
  const { slot, address, lamports } = data.parsedInput;
  console.log(`[STM] solana-account-balance: slot=${slot} address=${address} lamports=${lamports}`);

  yield* World.promise(pool.query(
    "INSERT INTO solana_balance_events (slot, address, lamports) VALUES ($1, $2, $3)",
    [slot, address, lamports],
  ));
});

stm.addStateTransition("solana-token-account", function* (data) {
  const { slot, tokenAccount, mint, owner, amount, decimals } = data.parsedInput;
  console.log(
    `[STM] solana-token-account: slot=${slot} account=${tokenAccount} mint=${mint} owner=${owner} amount=${amount}`,
  );

  yield* World.promise(pool.query(
    "INSERT INTO solana_token_events (slot, token_account, mint, owner, amount, decimals) VALUES ($1, $2, $3, $4, $5, $6)",
    [slot, tokenAccount, mint, owner, amount, decimals],
  ));
});

const appStateTransitions: StartConfigAppStateTransitions = function* (
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
      appStateTransitions,
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
      grammar,
    });
  });

  yield* suspend();
});
