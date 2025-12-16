import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@rock-paper-scissors/data-types/grammar";
import type { BaseStfInput } from "@paimaexample/sm";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import {
  getLobbyById,
  getRoundData,
  getCachedMoves,
} from "@rock-paper-scissors/db";
import {
  createdLobby,
  joinedLobby,
  closedLobby,
  submittedMoves,
  zombieRound,
  updateUserStats,
  type SQLUpdate,
} from "./state-machine/v1/transition.ts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);

// Create lobby
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Call pure transition function
  const result = createdLobby(
    // @ts-ignore - version mismatch between @paimaexample/utils versions
    user!,
    blockHeight,
    {
      input: "createdLobby",
      ...parsedInput,
    },
    randomGenerator
  );

  yield* printSQLQuery(result);
  // Check if this is a RawSQLQuery - if so, execute it directly
  if (result[0]?.queryIR?._rawSQL) {
    yield* executePgliteQuery(result[0], result[1]);
  } else {
    yield* World.resolve(result[0], result[1]);
  }
});

// Join lobby
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: user } = data;

  // Query the lobby first
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  // Call pure transition function
  const results = joinedLobby(
    // @ts-ignore - version mismatch between @paimaexample/utils versions
    user!,
    blockHeight,
    {
      input: "joinedLobby",
      ...parsedInput,
    },
    lobbyData
  );

  // Execute all SQL updates
  for (const result of results) {
    yield* printSQLQuery(result);
    yield* World.resolve(result[0], result[1]);
  }
});

// Close lobby
stm.addStateTransition("closedLobby", function* (data) {
  const { parsedInput, signerAddress: user } = data;

  // Query the lobby first
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  // Call pure transition function
  const results = closedLobby(
    // @ts-ignore - version mismatch between @paimaexample/utils versions
    user!,
    {
      input: "closedLobby",
      ...parsedInput,
    },
    lobbyData
  );

  // Execute all SQL updates
  for (const result of results) {
    yield* printSQLQuery(result);
    yield* World.resolve(result[0], result[1]);
  }
});

// Submit moves
stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Query lobby, round, and cached moves
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  const round = yield* World.resolve(getRoundData, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber
  });
  const roundData = round && round.length > 0 ? round[0] : null;

  const cachedMoves = yield* World.resolve(getCachedMoves, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber,
  });

  // Call pure transition function
  const results = submittedMoves(
    // @ts-ignore - version mismatch between @paimaexample/utils versions
    user!,
    blockHeight,
    {
      input: "submittedMoves",
      ...parsedInput,
    },
    lobbyData,
    roundData,
    cachedMoves || [],
    randomGenerator
  );

  // Execute all SQL updates
  for (const result of results) {
    yield* printSQLQuery(result);
    yield* World.resolve(result[0], result[1]);
  }
});

// Zombie round (timeout handling)
stm.addStateTransition("zombieScheduledData", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;

  // Query lobby first to get current_round
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  let roundData = null;
  let moves: any[] = [];

  if (lobbyData) {
    // Query round and moves
    const round = yield* World.resolve(getRoundData, {
      lobby_id: lobbyData.lobby_id,
      round: lobbyData.current_round,
    });
    roundData = round && round.length > 0 ? round[0] : null;

    if (roundData) {
      const cachedMoves = yield* World.resolve(getCachedMoves, {
        lobby_id: lobbyData.lobby_id,
        round: lobbyData.current_round,
      });
      moves = cachedMoves || [];
    }
  }

  // Call pure transition function
  const results = zombieRound(
    blockHeight,
    {
      input: "zombieScheduledData",
      ...parsedInput,
    },
    lobbyData,
    roundData,
    moves,
    randomGenerator
  );

  // Execute all SQL updates
  for (const result of results) {
    yield* printSQLQuery(result);
    yield* World.resolve(result[0], result[1]);
  }
});

// User stats update (scheduled after game ends)
stm.addStateTransition("userScheduledData", function* (data) {
  const { parsedInput } = data;

  // Call pure transition function
  const result = updateUserStats({
    input: "userScheduledData",
    ...parsedInput,
  });

  yield* printSQLQuery(result);
  // Check if this is a RawSQLQuery - if so, execute it directly
  if (result[0]?.queryIR?._rawSQL) {
    yield* executePgliteQuery(result[0], result[1]);
  } else {
    yield* World.resolve(result[0], result[1]);
  }
});

function* printSQLQuery(result: any) {
  console.error("--------------------------------");
  console.error(`Processing RPS Query`);
  console.error(`Prepared Query:\n${result[0].queryIR.statement}\n\n`);
  console.error(`Parameters:\n${JSON.stringify(result[1], null, 2)}\n\n`);
}

// Custom executor for PGlite queries that need parameter inlining
function* executePgliteQuery(query: any, params: any): any {
  console.error("!!!!! EXECUTING PGLITE QUERY WITH PARAMETER INLINING !!!!!");

  // Use World.resolve but pass our RawSQLQuery instance which has the _rawSQL flag
  // The runtime will create a PreparedQuery from query.queryIR, and our pglite-patch.ts
  // will intercept the constructor to patch the run() method
  const result = yield* World.resolve(query, params);

  return result;
}

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
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
