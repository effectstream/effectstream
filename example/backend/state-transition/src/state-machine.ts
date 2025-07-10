import { PaimaSTM } from "@paima/sm";
import { grammar } from "@example/data-types";
import type { BaseStfInput, BaseStfOutput } from "@paima/sm";
import { insertStateMachineInput } from "@example/database";
import type { StartConfigGameStateTransitions } from "@paima/runtime";
import {
  type INewScheduledHeightDataParams,
  type INewScheduledTimestampDataParams,
  newScheduledHeightData,
  newScheduledTimestampData,
} from "@paima/db";
import { run } from "npm:effection@3.5.0";
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

stm.addStateTransition(
  "schedule",
  async (data) => {
    const response: BaseStfOutput<MyEvents> = {
      stateTransitions: [],
      events: [],
    };
    // data.
    const { tick, message, type } = data.parsedInput;
    const playerId = parseInt(message);

    switch (type) {
      case "block":
        {
          const params: INewScheduledHeightDataParams = {
            // caip2?: string | null | void;
            from_address: "0x0",
            future_block_height: data.blockHeight + tick,
            input_data: JSON.stringify(["attack", playerId, 1]),
            // origin_contract_address?: string | null | void;
            // origin_tx_hash?: Buffer | null | void;
            // primitive_name?: string | null | void;
          };
          response.stateTransitions.push([newScheduledHeightData, params]);
        }
        break;
      case "timestamp":
        {
          const params2: INewScheduledTimestampDataParams = {
            from_address: "0x0",
            future_ms_timestamp: new Date(data.blockTimestamp + tick),
            input_data: JSON.stringify(["attack", playerId, 1]),
          };
          response.stateTransitions.push([newScheduledTimestampData, params2]);
        }
        break;
      default:
        throw new Error("Invalid type");
    }
    return response;
  },
);

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
