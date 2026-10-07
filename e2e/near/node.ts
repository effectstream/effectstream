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

// NearAccountWatch: raw FunctionCall outcome captured for the watched contractId
stm.addStateTransition("near-account-watch", function* (data) {
  const { signer_id, receiver_id, method_name, args, deposit, status } = data.parsedInput;
  console.log(`[STM] near-account-watch: ${signer_id} -> ${receiver_id}.${method_name}(${args}) deposit=${deposit} status=${status}`);

  yield* World.promise(pool.query(
    "INSERT INTO near_account_watches (block_height, signer_id, receiver_id, method_name, args, deposit, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [data.blockHeight, signer_id, receiver_id, method_name, args, deposit, status],
  ));
});

// NearNep141: fungible-token ft_transfer event
stm.addStateTransition("nep141-transfer", function* (data) {
  const { old_owner_id, new_owner_id, amount } = data.parsedInput;
  console.log(`[STM] nep141-transfer: ${old_owner_id} -> ${new_owner_id} amount=${amount}`);

  yield* World.promise(pool.query(
    "INSERT INTO near_nep141_transfers (block_height, old_owner_id, new_owner_id, amount) VALUES ($1,$2,$3,$4)",
    [data.blockHeight, old_owner_id, new_owner_id, amount],
  ));
});

// NearNep171: non-fungible-token nft_transfer event (one row per token_id)
stm.addStateTransition("nep171-transfer", function* (data) {
  const { old_owner_id, new_owner_id, token_id, isBurn } = data.parsedInput;
  console.log(`[STM] nep171-transfer: ${old_owner_id} -> ${new_owner_id} token=${token_id} burn=${isBurn}`);

  yield* World.promise(pool.query(
    "INSERT INTO near_nep171_transfers (block_height, old_owner_id, new_owner_id, token_id, is_burn) VALUES ($1,$2,$3,$4,$5)",
    [data.blockHeight, old_owner_id, new_owner_id, token_id, isBurn],
  ));
});

// NearNep245: multi-token mt_transfer event (one row per (token_id, amount) pair)
stm.addStateTransition("nep245-transfer", function* (data) {
  const { type, old_owner_id, new_owner_id, token_id, amount, isMint, isBurn } = data.parsedInput;
  console.log(`[STM] nep245-transfer: ${type} ${old_owner_id} -> ${new_owner_id} token=${token_id} amount=${amount} mint=${isMint} burn=${isBurn}`);

  yield* World.promise(pool.query(
    "INSERT INTO near_nep245_transfers (block_height, event_type, old_owner_id, new_owner_id, token_id, amount, is_mint, is_burn) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [data.blockHeight, type, old_owner_id, new_owner_id, token_id, amount, isMint, isBurn],
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
  console.log("Starting E2E NEAR Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-near",
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
