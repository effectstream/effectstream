import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { AddressType } from "@effectstream/utils";
import { newScheduledHeightData, removeScheduledBlockData } from "@effectstream/db";
import { Chess } from "chess.js";
import {
  createLobby,
  startMatch,
  closeLobby,
  endMatch,
  newRound,
  newMatchMove,
  executedRound,
  newFinalState,
  updateLatestMatchState,
  newStats,
  updateStats,
  getLobbyById,
  getRoundData,
  getUserStats,
} from "@chess-v2/database";
import { grammar } from "./grammar.ts";
import {
  gameOver,
  isValidMove,
  applyMove,
  initialState,
  extractMatchEnvironment,
  matchResults,
  updateTimer,
  currentPlayer,
  calculateRatingChange,
  expandResult,
  type ConciseResult,
  type Timer,
} from "./chess-helpers.ts";
import { calculateBestMove } from "./chess-ai.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player, randomGenerator } = data;
  const lobby_id = randomGenerator.nextString(12);

  yield* World.resolve(createLobby, {
    lobby_id,
    num_of_rounds: Math.min(Math.floor(parsedInput.numOfRounds), 10),
    round_length: Math.min(Math.floor(parsedInput.roundLength), 100),
    play_time_per_player: Math.min(Math.floor(parsedInput.playTimePerPlayer), 100),
    current_round: 0,
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: parsedInput.isHidden,
    practice: parsedInput.isPractice,
    bot_difficulty: parsedInput.botDifficulty,
    lobby_creator: player!,
    player_one_iswhite: parsedInput.playerOneIsWhite,
    player_two: null,
    lobby_state: "open",
    latest_match_state: new Chess().fen(),
  });

  yield* World.resolve(newStats, {
    stats: { wallet: player!, wins: 0, ties: 0, losses: 0, rating: 0 },
  });

  if (parsedInput.isPractice) {
    yield* activateLobby(lobby_id, "0x0", blockHeight, parsedInput.playTimePerPlayer, parsedInput.roundLength);
    yield* World.resolve(newStats, {
      stats: { wallet: "0x0", wins: 0, ties: 0, losses: 0, rating: 0 },
    });
    if (!parsedInput.playerOneIsWhite) {
      yield* scheduleBotMove(lobby_id, 1, blockHeight + 1);
    }
  }
});

stm.addStateTransition("joinLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby) return;
  if (lobby.player_two || lobby.lobby_state !== "open" || lobby.lobby_creator === player) return;

  yield* activateLobby(parsedInput.lobbyID, player!, blockHeight, lobby.play_time_per_player, lobby.round_length);
  yield* World.resolve(newStats, {
    stats: { wallet: player!, wins: 0, ties: 0, losses: 0, rating: 0 },
  });
});

stm.addStateTransition("closeLobby", function* (data) {
  const { parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby) return;
  if (lobby.player_two || lobby.lobby_state !== "open" || lobby.lobby_creator !== player) return;
  yield* World.resolve(closeLobby, { lobby_id: lobby.lobby_id });
});

stm.addStateTransition("submitMoves", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || lobby.lobby_state !== "active") return;

  const lobby_players = [lobby.lobby_creator, lobby.player_two];
  if (!lobby_players.includes(player!)) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: parsedInput.roundNumber,
  });
  if (!round) return;
  if (parsedInput.roundNumber !== lobby.current_round) return;
  if (!isValidMove(lobby.latest_match_state, parsedInput.pgnMove)) return;

  yield* World.resolve(newMatchMove, {
    new_move: {
      lobby_id: parsedInput.lobbyID,
      wallet: player!,
      round: lobby.current_round,
      move_pgn: parsedInput.pgnMove,
    },
  });

  yield* executeRound(blockHeight, lobby, parsedInput.pgnMove, round);

  if (lobby.practice) {
    yield* scheduleBotMove(lobby.lobby_id, lobby.current_round + 1, blockHeight + 1);
  }
});

stm.addStateTransition("z", function* (data) {
  const { blockHeight, parsedInput } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || !lobby.player_two) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: lobby.current_round,
  });
  if (!round) return;

  const pgnMove = calculateBestMove(lobby.latest_match_state, 0);
  if (pgnMove) {
    const player = currentPlayer(round.round_within_match, lobby);
    yield* World.resolve(newMatchMove, {
      new_move: { lobby_id: lobby.lobby_id, wallet: player, round: lobby.current_round, move_pgn: pgnMove },
    });
    yield* executeRound(blockHeight, lobby, pgnMove, round);
    if (lobby.practice) {
      yield* scheduleBotMove(lobby.lobby_id, lobby.current_round + 1, blockHeight + 1);
    }
  } else {
    yield* executeRound(blockHeight, lobby, null, round);
  }
});

stm.addStateTransition("u", function* (data) {
  const { parsedInput } = data;
  const [stats] = yield* World.resolve(getUserStats, { wallet: parsedInput.user });
  if (!stats) return;
  yield* World.resolve(updateStats, {
    stats: {
      wallet: parsedInput.user,
      wins: parsedInput.result === "w" ? stats.wins + 1 : stats.wins,
      losses: parsedInput.result === "l" ? stats.losses + 1 : stats.losses,
      ties: parsedInput.result === "t" ? stats.ties + 1 : stats.ties,
      rating: stats.rating + parsedInput.ratingChange,
    },
  });
});

stm.addStateTransition("sb", function* (data) {
  const { blockHeight, parsedInput } = data;
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: parsedInput.lobbyID });
  if (!lobby || !lobby.practice) return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: lobby.lobby_id,
    round_number: parsedInput.roundNumber,
  });
  if (!round) return;
  if (parsedInput.roundNumber !== lobby.current_round) return;

  const pgnMove = calculateBestMove(lobby.latest_match_state, lobby.bot_difficulty);
  if (!pgnMove) return;
  if (!isValidMove(lobby.latest_match_state, pgnMove)) return;

  yield* World.resolve(newMatchMove, {
    new_move: { lobby_id: parsedInput.lobbyID, wallet: "0x0", round: lobby.current_round, move_pgn: pgnMove },
  });

  yield* executeRound(blockHeight, lobby, pgnMove, round);
});

function* activateLobby(lobbyId: string, joiner: string, blockHeight: number, playTime: number, roundLength: number) {
  yield* World.resolve(startMatch, { lobby_id: lobbyId, player_two: joiner });
  const timer: Timer = { player_one_blocks_left: playTime, player_two_blocks_left: playTime };
  yield* createNewRound(lobbyId, 0, initialState(), timer, roundLength, blockHeight);
}

function* createNewRound(lobbyId: string, currentRound: number, matchState: string, timeLeft: Timer, roundLength: number, blockHeight: number) {
  const nextRound = currentRound + 1;
  yield* World.resolve(newRound, {
    lobby_id: lobbyId,
    round_within_match: nextRound,
    match_state: matchState,
    player_one_blocks_left: timeLeft.player_one_blocks_left,
    player_two_blocks_left: timeLeft.player_two_blocks_left,
    starting_block_height: blockHeight,
    execution_block_height: null,
  });
  const playerTimeLeft = nextRound % 2 === 1 ? timeLeft.player_one_blocks_left : timeLeft.player_two_blocks_left;
  const roundTime = Math.min(roundLength, playerTimeLeft);
  yield* World.resolve(newScheduledHeightData, {
    from_address: "0x0",
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight + roundTime,
    input_data: JSON.stringify(["z", lobbyId]),
  });
}

function* executeRound(blockHeight: number, lobby: any, pgnMove: string | null, roundData: any) {
  const newFen = pgnMove ? applyMove(lobby.latest_match_state, pgnMove) : lobby.latest_match_state;

  yield* World.resolve(updateLatestMatchState, { lobby_id: lobby.lobby_id, latest_match_state: newFen });
  yield* World.resolve(executedRound, { lobby_id: lobby.lobby_id, round: lobby.current_round, execution_block_height: blockHeight });

  if (lobby.round_length) {
    const zombieBlock = roundData.starting_block_height + lobby.round_length;
    if (zombieBlock !== blockHeight) {
      yield* World.resolve(removeScheduledBlockData, {
        block_height: zombieBlock,
        input_data: JSON.stringify(["z", lobby.lobby_id]),
      });
    }
  }

  const timer = updateTimer(roundData, blockHeight, lobby.player_one_iswhite);
  const hasTimeout = timer.player_one_blocks_left === 0 || timer.player_two_blocks_left === 0;
  const isFinal = lobby.num_of_rounds && lobby.current_round >= lobby.num_of_rounds;

  if (gameOver(newFen) || isFinal || hasTimeout) {
    yield* finalizeMatch(blockHeight, lobby, timer, newFen);
  } else {
    yield* createNewRound(lobby.lobby_id, lobby.current_round, newFen, timer, lobby.round_length, blockHeight);
  }
}

function* finalizeMatch(blockHeight: number, lobby: any, timer: Timer, fenBoard: string) {
  yield* World.resolve(endMatch, { lobby_id: lobby.lobby_id });

  if (lobby.practice) return;

  const matchEnv = extractMatchEnvironment(lobby);
  const results = matchResults(fenBoard, matchEnv, timer);
  const elapsedBlocks = [
    lobby.play_time_per_player - timer.player_one_blocks_left,
    lobby.play_time_per_player - timer.player_two_blocks_left,
  ];

  yield* World.resolve(newFinalState, {
    final_state: {
      lobby_id: lobby.lobby_id,
      player_one_iswhite: matchEnv.user1.color === "w",
      player_one_wallet: matchEnv.user1.wallet,
      player_one_result: expandResult(results[0]),
      player_one_elapsed_time: elapsedBlocks[0],
      player_two_wallet: matchEnv.user2.wallet,
      player_two_result: expandResult(results[1]),
      player_two_elapsed_time: elapsedBlocks[1],
      positions: fenBoard,
    },
  });

  const [user1Stats] = yield* World.resolve(getUserStats, { wallet: matchEnv.user1.wallet });
  const [user2Stats] = yield* World.resolve(getUserStats, { wallet: matchEnv.user2.wallet });
  const ratingChange = calculateRatingChange(user1Stats.rating, user2Stats.rating, results[0]);

  yield* scheduleStatsUpdate(matchEnv.user1.wallet, results[0], ratingChange, blockHeight + 1);
  yield* scheduleStatsUpdate(matchEnv.user2.wallet, results[1], -ratingChange, blockHeight + 1);
}

function* scheduleStatsUpdate(wallet: string, result: ConciseResult, ratingChange: number, blockHeight: number) {
  yield* World.resolve(newScheduledHeightData, {
    from_address: wallet,
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight,
    input_data: JSON.stringify(["u", wallet, result, String(ratingChange)]),
  });
}

function* scheduleBotMove(lobbyId: string, round: number, blockHeight: number) {
  yield* World.resolve(newScheduledHeightData, {
    from_address: "0x0",
    from_address_type: AddressType.NONE,
    future_block_height: blockHeight,
    input_data: JSON.stringify(["sb", lobbyId, String(round)]),
  });
}

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
