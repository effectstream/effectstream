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

const pool = getConnection();
const stm = new PaimaSTM<typeof grammar, {}>(grammar);

// BitcoinAddress primitive -> writes to bitcoin_transactions
stm.addStateTransition("bitcoin-transaction", function* (data) {
  const { direction, address, transactionId, index, valueSats, utxoTxid, utxoVout, label } = data.parsedInput;
  console.log(`[STM] bitcoin-tx: ${direction} ${valueSats} sats @ ${address}`);
  yield* World.promise(pool.query(
    "INSERT INTO bitcoin_transactions (block_height, direction, address, transaction_id, index, value_sats, utxo_txid, utxo_vout, label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [data.blockHeight, direction, address, transactionId, index, valueSats, utxoTxid, utxoVout, label || ''],
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
  console.log("Starting E2E-V2 Bitcoin Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-v2-bitcoin",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      grammar,
    });
  });

  yield* suspend();
});
