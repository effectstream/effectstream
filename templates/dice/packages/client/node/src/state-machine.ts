import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@dice/data-types/grammar";
import type { BaseStfInput } from "@paimaexample/sm";
import type { StartConfigAppStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import {
  getLobbyById,
  getRound,
  getRoundMoves,
  getLobbyPlayers,
  getUserStats,
  getMatch,
} from "@dice/db";
import {
  createdLobby,
  joinedLobby,
  closedLobby,
  submittedMoves,
  practiceMoves,
  zombieRound,
  updateUserStats,
  mintNft,
  type SQLUpdate,
} from "./state-machine/v1/transition.ts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);

// NFT Mint
stm.addStateTransition("nftMint", function* (data) {
  const { parsedInput } = data;

  console.log("NFT Mint - parsedInput:", JSON.stringify(parsedInput, null, 2));

  const results = yield* World.promise<SQLUpdate[]>(
    mintNft({
      input: "nftMint",
      ...parsedInput,
    })
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// Create lobby
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  const result = yield* World.promise<SQLUpdate[]>(
    createdLobby(
      // @ts-ignore - version mismatch between @paimaexample/utils versions
      user!,
      blockHeight,
      {
        input: "createdLobby",
        ...parsedInput,
      },
      randomGenerator
    )
  );

  for (const update of result) {
    yield* World.resolve(update[0], update[1]);
  }
});

// Join lobby
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Query the lobby first
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  // Query lobby players
  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: parsedInput.lobbyID });

  const results = yield* World.promise<SQLUpdate[]>(
    joinedLobby(
      // @ts-ignore - version mismatch between @paimaexample/utils versions
      user!,
      blockHeight,
      {
        input: "joinedLobby",
        ...parsedInput,
      },
      lobbyData,
      players || [],
      randomGenerator
    )
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// Close lobby
stm.addStateTransition("closedLobby", function* (data) {
  const { parsedInput, signerAddress: user } = data;

  // Query the lobby first
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  const results = yield* World.promise<SQLUpdate[]>(
    closedLobby(
      // @ts-ignore - version mismatch between @paimaexample/utils versions
      user!,
      {
        input: "closedLobby",
        ...parsedInput,
      },
      lobbyData
    )
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// Submit moves
stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Query lobby
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  // Query players
  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: parsedInput.lobbyID });

  // Query round
  const round = yield* World.resolve(getRound, {
    lobby_id: parsedInput.lobbyID,
    match_within_lobby: parsedInput.matchWithinLobby,
    round_within_match: parsedInput.roundWithinMatch,
  });
  const roundData = round && round.length > 0 ? round[0] : null;

  // Query moves (though typically empty for current round)
  const moves = yield* World.resolve(getRoundMoves, {
    lobby_id: parsedInput.lobbyID,
    match_within_lobby: parsedInput.matchWithinLobby,
    round_within_match: parsedInput.roundWithinMatch,
  });

  // Query match for seed
  const match = yield* World.resolve(getMatch, {
    lobby_id: parsedInput.lobbyID,
    match_within_lobby: parsedInput.matchWithinLobby,
  });
  const matchData = match && match.length > 0 ? match[0] : null;

  const results = yield* World.promise<SQLUpdate[]>(
    submittedMoves(
      // @ts-ignore - version mismatch between @paimaexample/utils versions
      user!,
      blockHeight,
      {
        input: "submittedMoves",
        ...parsedInput,
      },
      lobbyData,
      players || [],
      roundData,
      matchData,
      moves || [],
      randomGenerator
    )
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// Practice moves (AI/bot)
stm.addStateTransition("practiceMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: user } = data;

  // Query lobby
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  // Query players
  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: parsedInput.lobbyID });

  // Query match for seed
  const match = yield* World.resolve(getMatch, {
    lobby_id: parsedInput.lobbyID,
    match_within_lobby: parsedInput.matchWithinLobby,
  });
  const matchData = match && match.length > 0 ? match[0] : null;

  const results = yield* World.promise<SQLUpdate[]>(
    practiceMoves(
      // @ts-ignore - version mismatch between @paimaexample/utils versions
      user!,
      blockHeight,
      {
        input: "practiceMoves",
        ...parsedInput,
      },
      lobbyData,
      players || [],
      matchData,
      randomGenerator
    )
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// Zombie round (timeout handling)
stm.addStateTransition("zombieScheduledData", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;

  // Query lobby
  const lobby = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  const lobbyData = lobby && lobby.length > 0 ? lobby[0] : null;

  let players: any[] = [];
  let roundData = null;
  let moves: any[] = [];

  if (lobbyData && lobbyData.current_match != null && lobbyData.current_round != null) {
    // Query players
    players = (yield* World.resolve(getLobbyPlayers, { lobby_id: parsedInput.lobbyID })) || [];

    // Query round
    const round = yield* World.resolve(getRound, {
      lobby_id: parsedInput.lobbyID,
      match_within_lobby: lobbyData.current_match,
      round_within_match: lobbyData.current_round,
    });
    roundData = round && round.length > 0 ? round[0] : null;

    if (roundData) {
      moves = (yield* World.resolve(getRoundMoves, {
        lobby_id: parsedInput.lobbyID,
        match_within_lobby: lobbyData.current_match,
        round_within_match: lobbyData.current_round,
      })) || [];
    }
  }

  const results = yield* World.promise<SQLUpdate[]>(
    zombieRound(
      blockHeight,
      {
        input: "zombieScheduledData",
        ...parsedInput,
      },
      lobbyData,
      players,
      roundData,
      moves,
      randomGenerator
    )
  );

  for (const result of results) {
    yield* World.resolve(result[0], result[1]);
  }
});

// User stats update (scheduled after game ends)
stm.addStateTransition("userScheduledData", function* (data) {
  const { parsedInput } = data;

  // Query user stats
  const stats = yield* World.resolve(getUserStats, { nft_id: parsedInput.nftId });
  const statsData = stats && stats.length > 0 ? stats[0] : null;

  const result = yield* World.promise<SQLUpdate>(
    updateUserStats(
      {
        input: "userScheduledData",
        ...parsedInput,
      },
      statsData
    )
  );

  yield* World.resolve(result[0], result[1]);
});

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
 */
export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
  return;
};
