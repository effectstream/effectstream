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

const pool = getConnection();
const stm = new Stm<typeof grammar, {}>(grammar);

// BitcoinAddress primitive -> writes to bitcoin_transactions
stm.addStateTransition("bitcoin-transaction", function* (data) {
  const { direction, address, transactionId, index, valueSats, utxoTxid, utxoVout, label } = data.parsedInput;
  console.log(`[STM] bitcoin-tx: ${direction} ${valueSats} sats @ ${address}`);
  yield* World.promise(pool.query(
    "INSERT INTO bitcoin_transactions (block_height, direction, address, transaction_id, index, value_sats, utxo_txid, utxo_vout, label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [data.blockHeight, direction, address, transactionId, index, valueSats, utxoTxid, utxoVout, label || ''],
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
  console.log("Starting E2E Bitcoin Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-bitcoin",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      grammar,
      migrations: [
        { name: "create-user-tables", sql: createUserTables },
      ],
    });
  });

  yield* suspend();
});
