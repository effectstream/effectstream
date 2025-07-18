import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import {
  getLastSumFromExampleTable,
  insertStateMachineInput,
  insertSumIntoExampleTable,
} from "@example/database";
import type { StartConfigGameStateTransitions } from "@paima/runtime";
import { newScheduledHeightData, newScheduledTimestampData } from "@paima/db";
import { type SyncStateUpdateStream, World } from "@paima/coroutine";
// import { createScheduledData } from "@paima/db";

type MyEvents = {}; // TODO: replace
const stm = new PaimaSTM<typeof grammar, MyEvents>(grammar);

// Example promise.
async function sum(a: number, b: number) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return a + b;
}

stm.addStateTransition(
  "attack",
  function* (data) {
    // Example 1:
    // How to write in the DB.
    yield* World.resolve(insertStateMachineInput, {
      inputs:
        `attack playerId: ${data.parsedInput.playerId} with moveId: ${data.parsedInput.moveId}`,
      block_height: data.blockHeight,
    });

    // Example 2:
    // How to read from the DB.
    const [lastSum] = yield* World.resolve(
      getLastSumFromExampleTable,
      undefined,
    );
    const value = lastSum ? lastSum.sum : 0;

    // Example 3:
    // How to run a custom promise.
    const result = yield* World.promise(sum(value, 3));

    // Example 4:
    // How to write in the DB.
    yield* World.resolve(insertSumIntoExampleTable, {
      sum: result,
      block_height: data.blockHeight,
    });
    return;
  },
);

stm.addStateTransition(
  "throw_error",
  function* (data) {
    throw new Error("This is a test error");
  },
);

stm.addStateTransition(
  "schedule",
  function* (data) {
    const { tick, message, type } = data.parsedInput;
    const playerId = parseInt(message);

    switch (type) {
      case "block":
        yield* World.resolve(newScheduledHeightData, {
          from_address: "0x0",
          future_block_height: data.blockHeight + tick,
          input_data: JSON.stringify(["attack", playerId, 1]),
        });
        break;

      case "timestamp":
        yield* World.resolve(newScheduledTimestampData, {
          from_address: "0x0",
          future_ms_timestamp: new Date(data.blockTimestamp + tick),
          input_data: JSON.stringify(["attack", playerId, 1]),
        });

        break;
      default:
        throw new Error("Invalid type");
    }
    return;
  },
);

stm.addStateTransition(
  "transfer",
  function* (data) {
    const { to, from, value } = data.parsedInput.payload;
    yield* World.resolve(insertStateMachineInput, {
      inputs: `transfer ${value} from ${from} to ${to}`,
      block_height: data.blockHeight,
    });
    return;
  },
);

// stm.finalize(); // this avoids people dynamically calling stm.addStateTransition after initialization

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
 * @param blockHeight - The block height to process the game state transitions for.
 * @param input - The input to process the game state transitions for.
 * @returns The result of the game state transitions.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};
