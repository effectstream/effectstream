import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@chess/data-types/grammar";
import type { BaseStfInput } from "@paimaexample/sm";
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
import type {
  BotMove,
  UserStats,
  ZombieRound,
} from "./state-machine/v1/types.ts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);
type SQLUpdate = [any, any];

stm.addStateTransition("createdLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const result = yield* World.promise<SQLUpdate[]>(
    createdLobby(
      user!,
      blockHeight,
      {
        input: "createdLobby",
        ...parsedInput,
      },
      randomGenerator
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("joinLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    joinedLobby(
      user!,
      blockHeight,
      {
        input: "joinedLobby",
        ...parsedInput,
      },
      dbConn
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("closeLobby", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    closedLobby(
      user!,
      {
        input: "closedLobby",
        ...parsedInput,
      },
      dbConn
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("submitMoves", function* (data) {
  const user = data.signerAddress;
  const { blockHeight, parsedInput, randomGenerator } = data;
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    submittedMoves(
      user!,
      blockHeight,
      {
        input: "submittedMoves",
        ...parsedInput,
      },
      dbConn,
      randomGenerator
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("z", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  console.log("Processing Zombie Round", parsedInput);
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        effect: "zombie",
        ...parsedInput,
      } as ZombieRound,
      dbConn,
      randomGenerator
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("u", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  console.log("Processing User Stats", parsedInput);
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        effect: "stats",
        ...parsedInput,
      } as UserStats,
      dbConn,
      randomGenerator
    )
  );
  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

stm.addStateTransition("sb", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  console.log("Processing Scheduled Bot Move", parsedInput);
  const dbConn = getConnection();
  const result = yield* World.promise<SQLUpdate[]>(
    scheduledData(
      blockHeight,
      {
        input: "scheduledData",
        effect: "move",
        ...parsedInput,
      } as BotMove,
      dbConn,
      randomGenerator
    )
  );

  for (let i = 0; i < result.length; i++) {
    yield* printSQLQueries(i, result[i]);
    yield* World.resolve(result[i][0], result[i][1]);
  }
});

function* printSQLQueries(index: number, result: any) {
  console.error("--------------------------------");
  console.error(`Processing Query ${index + 1}`);
  console.error(`Prepared Query:\n${result[0].queryIR.statement}\n\n`);
  console.error(`Parameters:\n${JSON.stringify(result[1], null, 2)}\n\n`);
}

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
