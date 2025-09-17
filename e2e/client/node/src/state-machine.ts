import { PaimaSTM } from "@paima/sm";
import { grammar } from "@e2e/data-types";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import {
  getLastSumFromExampleTable,
  insertStateMachineInput,
  insertSumIntoExampleTable,
} from "@e2e/database";
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
type SQLUpdate = [any, any];
async function paimaV1Operation(): Promise<SQLUpdate[]> {
  return [
    [
      insertSumIntoExampleTable,
      {
        sum: 1,
        block_height: -1, // So we can filter them out.
      },
    ],
    [
      insertSumIntoExampleTable,
      {
        sum: 2,
        block_height: -1, // So we can filter them out.
      },
    ],
  ];
}

stm.addStateTransition("attack", function* (data) {
  // Example 1:
  // How to write in the DB.
  yield* World.resolve(insertStateMachineInput, {
    inputs: `attack playerId: ${data.parsedInput.playerId} with moveId: ${data.parsedInput.moveId}`,
    block_height: data.blockHeight,
  });

  // Example 2:
  // How to read from the DB.
  const [lastSum] = yield* World.resolve(getLastSumFromExampleTable, undefined);
  // Example 3:
  // How to use the random generator.
  const value = lastSum ? lastSum.sum : data.randomGenerator.nextInt(10, 99);

  // Example 4:
  // How to run a custom promise.
  const result = yield* World.promise(sum(value, 3));

  // Example 5:
  // How to write in the DB.
  yield* World.resolve(insertSumIntoExampleTable, {
    sum: result,
    block_height: data.blockHeight,
  });

  // Example 6:
  // This check is verify the underlying World.promise is working correctly.
  const paimaV1Result = yield* World.promise(paimaV1Operation());
  if (!Array.isArray(paimaV1Result)) {
    throw new Error("Result is not an array");
  }
  if (typeof paimaV1Result[0][1].sum !== "number") {
    throw new Error("Sum is not a number");
  }

  for (let i = 0; i < paimaV1Result.length; i++) {
    yield* World.resolve(paimaV1Result[i][0], paimaV1Result[i][1]);
  }

  return;
});

stm.addStateTransition("midnightContractState", function* (data) {
  const { payload } = data.parsedInput;
  console.error("🎉 [MIDNIGHT] Transaction receipt:", payload);
  return;
});

stm.addStateTransition("throw_error", function* (data) {
  throw new Error("This is a test error");
});

stm.addStateTransition("schedule", function* (data) {
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
});

stm.addStateTransition("transfer-erc20", function* (data) {
  const { to, from, value } = data.parsedInput;
  yield* World.resolve(insertStateMachineInput, {
    inputs: `transfer ${value} from ${from} to ${to}`,
    block_height: data.blockHeight,
  });
  return;
});

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
  input: BaseStfInput
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};
