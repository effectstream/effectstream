import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@chess/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import {
  closedLobby,
  createdLobby,
  joinedLobby,
  scheduledData,
  submittedMoves,
} from "./state-machine/v1/transition.ts";
import { getConnection } from "@paimaexample/db";

const stm = new PaimaSTM<typeof grammar, any>(grammar);
type SQLUpdate = [any, any];

stm.addStateTransition("createdLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const result = yield* World.promise<SQLUpdate[]>(
    new Promise((resolve, reject) => {
      return createdLobby(user!, blockHeight, {
        input: "createdLobby",
        ...parsedInput,
      }, randomGenerator).then((r) => {
        console.error("r", r);
        // TODO We have a issue where the result is unpacked.
        //      So we return an extra []
        resolve([r] as SQLUpdate[]);
      }).catch((e) => {
        console.error("e", e);
        reject(e);
      });
  })
  );

  for (let i = 0; i < result.length; i++) {
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("joinedLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    joinedLobby(user!, blockHeight, {
      input: "joinedLobby",
      ...parsedInput,
    }, dbConn),
  );
});

stm.addStateTransition("closedLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    closedLobby(user!, {
      input: "closedLobby",
      ...parsedInput,
    }, dbConn),
  );
});

stm.addStateTransition("submittedMoves", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    submittedMoves(
      user!,
      blockHeight,
      {
        input: "submittedMoves",
        ...parsedInput,
      },
      dbConn,
      randomGenerator,
    ),
  );
});

stm.addStateTransition("zombieScheduledData", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        ...parsedInput,
      },
      dbConn,
      randomGenerator,
    ),
  );
});

stm.addStateTransition("userScheduledData", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        ...parsedInput,
      },
      dbConn,
      randomGenerator,
    ),
  );
});

stm.addStateTransition("scheduledBotMove", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        ...parsedInput,
      },
      dbConn,
      randomGenerator,
    ),
  );
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
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};
