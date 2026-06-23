import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { getConnection } from "@effectstream/db";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);
const pool = getConnection();

stm.addStateTransition("solana-program-log", function* (data) {
  const { parsedInput, blockHeight } = data;
  const { slot, programId, logMessages } = parsedInput;

  console.log(
    `[STM] solana-program-log: block=${blockHeight} slot=${slot} program=${programId} logs=${logMessages.length}`,
  );

  // Persist to a public table the frontend reads via GET /tables/solana_memos.
  yield* World.promise(pool.query(
    "INSERT INTO solana_memos (slot, program_id, log_messages) VALUES ($1, $2, $3)",
    [slot, programId, JSON.stringify(logMessages)],
  ));
});

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
