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

// UTXORpc Generic: indexes Cardano transactions matching the address predicate
stm.addStateTransition("cardano-utxo-rpc-generic", function* (data) {
  const { hash, bytes } = data.parsedInput;
  console.log(`[STM] cardano-utxo: hash=${hash}`);
  yield* World.promise(pool.query(
    "INSERT INTO cardano_transactions (block_height, tx_hash, bytes_hex) VALUES ($1, $2, $3)",
    [data.blockHeight, hash, bytes],
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
  console.log("Starting E2E-V2 Cardano Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-v2-cardano",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      gameStateTransitions,
      grammar,
    });
  });

  yield* suspend();
});
