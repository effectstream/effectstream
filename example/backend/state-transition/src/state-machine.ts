import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { insertStateMachineInput } from "@example/database";
import type { StartConfigGameStateTransitions } from "@paima/runtime";
// import { createScheduledData } from "@paima/db";

type MyEvents = {}; // TODO: replace
const stm = new PaimaSTM<typeof grammar, MyEvents>(grammar);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
stm.addStateTransition(
  "attack",
  async (data) => {
    await sleep(0);
    return {
      stateTransitions: [
        [insertStateMachineInput, {
          inputs:
            `attack playerId: ${data.parsedInput.playerId} with moveId: ${data.parsedInput.moveId}`,
          block_height: data.blockHeight,
        }],
      ],
      events: [],
    };
  },
);

// stm.addStateTransition(
//   "schedule",
//   async (data) => {
//     [createScheduledData, createScheduledDataPayload]

//     return {
//       stateTransitions: [],
//       events: [],
//     };
//   },
// );

stm.addStateTransition(
  "transfer",
  async (data) => {
    // console.error(data);
    await sleep(0);
    const { to, from, value } = data.parsedInput.payload;
    // This is where game logic is executed.
    return {
      stateTransitions: [
        [insertStateMachineInput, {
          inputs: `transfer ${value} from ${from} to ${to}`,
          block_height: data.blockHeight,
        }],
      ],
      events: [],
    };
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
export const gameStateTransitions: StartConfigGameStateTransitions =
  async function (
    blockHeight: number,
    input: BaseStfInput,
  ): Promise<BaseStfOutput<MyEvents>> {
    let result;
    if (blockHeight >= 0) {
      result = await stm.processInput(input);
    } else {
      result = await stm.processInput(input);
    }
    return result;
  };
