import type { Pool } from "pg";
import type { Prando } from "@paimaexample/crypto";
import { AddressType, type WalletAddress } from "@paimaexample/utils";
import type {
  IGetLobbyByIdResult,
  IGetRoundDataResult,
  IGetRoundMovesResult,
} from "@chess/db";
import { endMatch, getLobbyById, getRoundData, getUserStats } from "@chess/db";
import type { MatchState } from "@chess/game-logic";
import {
  calculateRatingChange,
  extractMatchEnvironment,
  gameOver,
  initRoundExecutor,
  matchResults,
} from "@chess/game-logic";

import { isValidMove } from "@chess/game-logic";
import type {
  BotMove,
  ClosedLobbyInput,
  CreatedLobbyInput,
  JoinedLobbyInput,
  ScheduledDataInput,
  SubmittedMovesInput,
  UserStats,
} from "./types.ts";
import { isBotMove, isUserStats, isZombieRound } from "./types.ts";
import type { ConciseResult, Timer } from "@chess/utils";
import { currentPlayer, updateTimer } from "@chess/utils";
import { calculateBestMove } from "../persist/ai.ts";
import {
  persistCloseLobby,
  persistLobbyCreation,
  persistLobbyJoin,
} from "../persist/lobby.ts";
import {
  persistExecutedRound,
  persistMatchResults,
  persistMoveSubmission,
  persistNewRound,
  persistUpdateMatchState,
} from "../persist/match.ts";
import { schedulePracticeMove } from "../persist/practice.ts";
import { persistStatsUpdate, scheduleStatsUpdate } from "../persist/stats.ts";
import { generateZombieMove } from "../persist/zombie.ts";

type SQLUpdate = [any, any];

// State transition when a create lobby input is processed
export const createdLobby = async (
  player: WalletAddress,
  blockHeight: number,
  input: CreatedLobbyInput,
  randomnessGenerator: Prando,
): Promise<SQLUpdate[]> => {
  return persistLobbyCreation(player, blockHeight, input, randomnessGenerator);
};

// State transition when a join lobby input is processed
export const joinedLobby = async (
  player: WalletAddress,
  blockHeight: number,
  input: JoinedLobbyInput,
  dbConn: Pool,
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (lobby) return persistLobbyJoin(blockHeight, player, input, lobby);
  else return [];
};

// State transition when a close lobby input is processed
export const closedLobby = async (
  player: WalletAddress,
  input: ClosedLobbyInput,
  dbConn: Pool,
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby) return [];
  const query = persistCloseLobby(player, lobby);
  // persisting failed the validation, bail
  if (!query) return [];
  console.log(query, "closing lobby");
  return [query];
};

// State transition when a submit moves input is processed
export const submittedMoves = async (
  player: WalletAddress,
  blockHeight: number,
  input: SubmittedMovesInput,
  dbConn: Pool,
  prando: Prando,
): Promise<SQLUpdate[]> => {
  // Perform DB read queries to get needed data
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby) return [];
  const [round] = await getRoundData.run(
    { lobby_id: lobby.lobby_id, round_number: input.roundNumber },
    dbConn,
  );
  // If the submitted moves are usable/all validation passes, continue
  if (!validateSubmittedMove(lobby, round, input, player)) return [];
  // Generate update to persist the moves
  const persistMoveTuple = persistMoveSubmission(player, input, lobby);
  // We generated an SQL update for persisting the moves.
  // Now we capture the params (the moves typed as we need) and pass it to the round executor.
  const newMove: IGetRoundMovesResult = persistMoveTuple[1].new_move;
  // Execute the round and collect persist SQL updates
  const roundExecutionTuples = await executeRound(
    blockHeight,
    lobby,
    [newMove],
    round,
    dbConn,
    prando,
  );

  // In practice mode we will submit a move for the AI after user's input
  if (lobby.practice) {
    const nextRound = lobby.current_round + 1;
    const practiceMove = schedulePracticeMove(
      lobby.lobby_id,
      nextRound,
      blockHeight + 1,
    );
    return [persistMoveTuple, ...roundExecutionTuples, practiceMove];
  }

  return [persistMoveTuple, ...roundExecutionTuples];
};

/**
 * State transition for a bot to generate&persist move. Done separately in order to track game's time correctly
 * WARN: higher difficulties might take non-trivial amount of time to process
 */
export const submittedBotMove = async (
  blockHeight: number,
  input: BotMove,
  dbConn: Pool,
  prando: Prando,
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby || !lobby.practice) return [];
  const [round] = await getRoundData.run(
    { lobby_id: lobby.lobby_id, round_number: input.roundNumber },
    dbConn,
  );

  const practiceMove = calculateBestMove(
    lobby.latest_match_state,
    lobby.bot_difficulty,
  );
  if (!practiceMove) return [];

  const botMove: SubmittedMovesInput = {
    input: "submittedMoves",
    lobbyID: input.lobbyID,
    roundNumber: input.roundNumber,
    pgnMove: practiceMove,
  };
  // If the submitted moves are usable/all validation passes, continue
  if (!validateSubmittedMove(lobby, round, botMove, "0x0")) { // TODO This should be a Paima Engine Constant
    return [];
  }
  // Generate update to persist the moves
  const persistMoveTuple = persistMoveSubmission(
    "0x0", // TODO This should be a Paima Engine Constant
    botMove,
    lobby,
  );
  // We generated an SQL update for persisting the moves.
  // Now we capture the params (the moves typed as we need) and pass it to the round executor.
  const newMove: IGetRoundMovesResult = persistMoveTuple[1].new_move;

  // Execute the round and collect persist SQL updates
  const roundExecutionTuples = await executeRound(
    blockHeight,
    lobby,
    [newMove],
    round,
    dbConn,
    prando,
  );

  return [persistMoveTuple, ...roundExecutionTuples];
};

// Validate submitted moves in relation to player/lobby/round state
function validateSubmittedMove(
  lobby: IGetLobbyByIdResult,
  round: IGetRoundDataResult,
  input: SubmittedMovesInput,
  player: WalletAddress,
): boolean {
  // If lobby not active or existing
  if (!lobby || lobby.lobby_state !== "active") return false;

  // If user does not belong to lobby
  const lobby_players = [lobby.lobby_creator, lobby.player_two];
  if (!lobby_players.includes(player)) return false;

  // Verify fetched round exists
  if (!round) return false;

  // If moves submitted don't target the current round
  if (input.roundNumber !== lobby.current_round) return false;

  // If a move is sent that doesn't fit in the lobby grid size or is strictly invalid
  if (!isValidMove(lobby.latest_match_state, input.pgnMove)) return false;

  return true;
}

// State transition when scheduled data is processed
export const scheduledData = async (
  blockHeight: number,
  input: ScheduledDataInput,
  dbConn: Pool,
  randomnessGenerator: Prando,
): Promise<SQLUpdate[]> => {
  // This executes 'zombie rounds', rounds which have reached the specified timeout time per round.
  if (isZombieRound(input)) {
    return zombieRound(blockHeight, input.lobbyID, dbConn, randomnessGenerator);
  }
  // Update the users stats
  if (isUserStats(input)) {
    return updateStats(input, dbConn);
  }
  if (isBotMove(input)) {
    return submittedBotMove(blockHeight, input, dbConn, randomnessGenerator);
  }
  return [];
};

// State transition when a zombie round input is processed
export const zombieRound = async (
  blockHeight: number,
  lobbyId: string,
  dbConn: Pool,
  prando: Prando,
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyId }, dbConn);
  if (!lobby) return [];
  if (!lobby.player_two) {
    console.error(
      `Lobby ${lobby.lobby_id} is missing a player two. Skipping zombie round.`,
    );
    return [];
  }

  const [round] = await getRoundData.run(
    { lobby_id: lobby.lobby_id, round_number: lobby.current_round },
    dbConn,
  );
  if (!round) return [];

  console.log(
    `Executing zombie round (#${lobby.current_round}) for lobby ${lobby.lobby_id}`,
  );

  let move: SubmittedMovesInput | null = null;
  let player: WalletAddress | null = null;
  let newMove: IGetRoundMovesResult | null = null;
  try {
    // we generate a bot move with difficulty=0 in order to proceed (you can't skip turn in chess)
    move = generateZombieMove(lobby);
    if (!move) {
      return await executeRound(blockHeight, lobby, [], round, dbConn, prando);
    }
    player = currentPlayer(round.round_within_match, lobby);
    const persistMoveTuple = persistMoveSubmission(player, move, lobby);
    newMove = persistMoveTuple[1].new_move as IGetRoundMovesResult;
    const roundExecutionTuples = await executeRound(
      blockHeight,
      lobby,
      [newMove],
      round,
      dbConn,
      prando,
    );

    if (lobby.practice) {
      const nextRound = lobby.current_round + 1;
      const practiceMove = schedulePracticeMove(
        lobby.lobby_id,
        nextRound,
        blockHeight + 1,
      );
      return [persistMoveTuple, ...roundExecutionTuples, practiceMove];
    }

    return [persistMoveTuple, ...roundExecutionTuples];
  } catch (e) {
    console.log(`CRITICAL ERROR. zombieRound was not processed.`, {
      blockHeight,
      lobbyId,
      prando: prando.seed,
      lobby,
      round,
      move,
      player,
      newMove,
    });
    console.log(e);
    return [];
  }
};

// State transition when an update stats input is processed
export const updateStats = async (
  newStats: UserStats,
  dbConn: Pool,
): Promise<SQLUpdate[]> => {
  const [stats] = await getUserStats.run({ wallet: newStats.user }, dbConn);
  // Verify coherency that the user has existing stats which can be updated
  if (stats) {
    const query = persistStatsUpdate(newStats, stats);
    console.log(query[1], `Updating stats of ${newStats.user}`);
    return [query];
  }
  return [];
};

// Runs the round executor and produces the necessary SQL updates as a result
export async function executeRound(
  blockHeight: number,
  lobby: IGetLobbyByIdResult,
  moves: IGetRoundMovesResult[],
  roundData: IGetRoundDataResult,
  dbConn: Pool,
  randomnessGenerator: Prando,
): Promise<SQLUpdate[]> {
  // We initialize the round executor object and run it/get the new match state via `.endState()`
  const executor = initRoundExecutor(
    lobby,
    roundData.round_within_match,
    roundData.match_state,
    moves,
    randomnessGenerator,
  );
  const newState = executor.endState();

  // We generate updates to the lobby to apply the new match state
  const lobbyUpdate = persistUpdateMatchState(lobby.lobby_id, newState);

  // We generate updates for the executed round
  const executedRoundUpdate = persistExecutedRound(
    roundData,
    lobby,
    blockHeight,
  );

  const timer = updateTimer(roundData, blockHeight, lobby.player_one_iswhite);
  const hasTimeout = timer.player_one_blocks_left === 0 ||
    timer.player_two_blocks_left === 0;
  // Finalize match if game is over or we have reached the final round
  let roundResultUpdate: SQLUpdate[];
  if (gameOver(newState.fenBoard) || isFinalRound(lobby) || hasTimeout) {
    console.log(lobby.lobby_id, "match ended, finalizing");
    roundResultUpdate = await finalizeMatch(
      blockHeight,
      lobby,
      timer,
      newState,
      dbConn,
    );
  } // Else create a new round
  else {
    roundResultUpdate = persistNewRound(
      lobby.lobby_id,
      lobby.current_round,
      newState.fenBoard,
      timer,
      lobby.round_length,
      blockHeight,
    );
  }

  return [lobbyUpdate, ...executedRoundUpdate, ...roundResultUpdate].filter(
    (item): item is SQLUpdate => !!item,
  );
}

// Finalizes the match and updates user statistics according to final score of the match
async function finalizeMatch(
  blockHeight: number,
  lobby: IGetLobbyByIdResult,
  timer: Timer,
  newState: MatchState,
  pool: Pool,
): Promise<SQLUpdate[]> {
  const matchEnvironment = extractMatchEnvironment(lobby);

  // Create update which sets lobby state to 'finished'
  const endMatchTuple: SQLUpdate = [endMatch, { lobby_id: lobby.lobby_id }];

  // If practice lobby, then no extra results/stats need to be updated
  if (lobby.practice) {
    console.log(`Practice match ended, ignoring results`);
    return [endMatchTuple];
  }

  // Save the final results in the final states table
  const results = matchResults(newState, matchEnvironment, timer);
  const elapsedBlocks = [
    lobby.play_time_per_player - timer.player_one_blocks_left,
    lobby.play_time_per_player - timer.player_two_blocks_left,
  ];
  const resultsUpdate = persistMatchResults(
    lobby.lobby_id,
    results,
    matchEnvironment,
    elapsedBlocks,
    newState,
  );

  const [[user1Stats], [user2Stats]] = await Promise.all([
    getUserStats.run({ wallet: matchEnvironment.user1.wallet }, pool),
    getUserStats.run({ wallet: matchEnvironment.user2.wallet }, pool),
  ]);
  const ratingChange = calculateRatingChange(
    user1Stats.rating,
    user2Stats.rating,
    results[0] as ConciseResult,
  );
  // Create the new scheduled data for updating user stats.
  // Stats are updated with scheduled data to support parallelism safely.
  const statsUpdate1 = scheduleStatsUpdate(
    matchEnvironment.user1.wallet,
    // Unknown address type.
    AddressType.NONE,
    results[0] as ConciseResult,
    ratingChange,
    blockHeight + 1,
  );
  const statsUpdate2 = scheduleStatsUpdate(
    matchEnvironment.user2.wallet,
    // Unknown address type.
    AddressType.NONE,
    results[1] as unknown as ConciseResult,
    -ratingChange,
    blockHeight + 1,
  );
  return [endMatchTuple, resultsUpdate, statsUpdate1, statsUpdate2];
}

// Check if lobby is in final round
function isFinalRound(lobby: IGetLobbyByIdResult): boolean {
  if (lobby.num_of_rounds && lobby.current_round >= lobby.num_of_rounds) {
    return true;
  }
  return false;
}
