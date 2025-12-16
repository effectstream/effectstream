import type { Pool } from 'pg';
import type Prando from '@paima/sdk/prando';
import type { SQLUpdate } from '@paima/node-sdk/db';

import type { IGetLobbyByIdResult, IGetRoundMovesResult, IGetRoundDataResult } from '@game/db';
import { getCachedMoves, getLobbyById, getRoundData, getUserStats, endMatch } from '@game/db';

import {
  persistUpdateMatchState,
  persistCloseLobby,
  persistLobbyCreation,
  persistLobbyJoin,
  persistMoveSubmission,
  persistStatsUpdate,
  scheduleStatsUpdate,
  persistNewRound,
  persistExecutedRound,
  persistMatchResults,
  schedulePracticeMove,
} from './persist';

import type {
  ClosedLobbyInput,
  CreatedLobbyInput,
  JoinedLobbyInput,
  ScheduledDataInput,
  SubmittedMovesInput,
} from './types';
import { isUserStats, isZombieRound } from './types';

import type { MatchState, RPSActions, RPSSummary, ShortNotationGameResult } from '@game/game-logic';
import {
  extractMatchEnvironment,
  initRoundExecutor,
  RockPaperScissors,
  GameResult,
} from '@game/game-logic';
import { PracticeAI } from './persist/practice-ai';
import type { WalletAddress } from '@paima/sdk/utils';

// State transition when a create lobby input is processed
export const createdLobby = async (
  player: WalletAddress,
  blockHeight: number,
  input: CreatedLobbyInput,
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> => {
  return persistLobbyCreation(player, blockHeight, input, randomnessGenerator);
};

// State transition when a join lobby input is processed
export const joinedLobby = async (
  player: WalletAddress,
  blockHeight: number,
  input: JoinedLobbyInput,
  dbConn: Pool
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby) return [];
  return persistLobbyJoin(blockHeight, player, input, lobby);
};

// State transition when a close lobby input is processed
export const closedLobby = async (
  player: WalletAddress,
  input: ClosedLobbyInput,
  dbConn: Pool
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby) return [];
  const query = persistCloseLobby(player, lobby);
  // persisting failed the validation, bail
  if (!query) return [];
  return [query];
};

// State transition when a submit moves input is processed
export const submittedMoves = async (
  player: WalletAddress,
  blockHeight: number,
  input: SubmittedMovesInput,
  dbConn: Pool,
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> => {
  // Perform DB read queries to get needed data
  const [lobby] = await getLobbyById.run({ lobby_id: input.lobbyID }, dbConn);
  if (!lobby) {
    console.log(`Error lobby ${input.lobbyID} not found`);
    return [];
  }

  const [round] = await getRoundData.run(
    { lobby_id: lobby.lobby_id, round_number: input.roundNumber },
    dbConn
  );
  if (!round) {
    console.log(`Error round ${input.roundNumber} for ${input.lobbyID} not found`);
    return [];
  }

  const newMove = input.move_rps;
  // If the submitted moves are usable/all validation passes, continue
  if (!validateSubmittedMoves(lobby, round, input, player, newMove)) {
    return [];
  }

  // Now we capture the params (the moves typed as we need) and pass it to the round executor.
  // Generate update to persist the moves
  // We generated an SQL update for persisting the moves.
  const nextMove = persistMoveSubmission(player, input, lobby);

  // We get previous moves in the same round.
  const cachedMoved = await getCachedMoves.run({ lobby_id: lobby.lobby_id }, dbConn);
  cachedMoved.push(nextMove[1]);

  // RockPaperScissor REQUIRES both players to play to run the executor.
  if (cachedMoved.length === 1) {
    // Only persist internal state until next player plays OR zombie round is executed.
    const rps = new RockPaperScissors(lobby.latest_match_state);
    if (!rps.isValidMove(lobby.lobby_creator === player, input.move_rps, input.roundNumber)) {
      return [];
    }

    rps.inputMove(lobby.lobby_creator === player, input.move_rps, input.roundNumber);

    if (lobby.practice) {
      const practiceAI = new PracticeAI(rps.state, randomnessGenerator);
      const practiceMove = practiceAI.getNextMove();
      const practiceMoveSchedule = schedulePracticeMove(
        lobby.lobby_id,
        lobby.current_round,
        practiceMove,
        blockHeight + 1
      );
      return [nextMove, practiceMoveSchedule];
    } else {
      return [nextMove];
    }
  } else if (cachedMoved.length === 2) {
    // Execute the round and collect persist SQL updates
    const roundExecutionTuples = executeRound(
      blockHeight,
      lobby,
      cachedMoved,
      round,
      randomnessGenerator
    );

    return [nextMove, ...roundExecutionTuples];
  }

  return [];
};

// Validate submitted moves in relation to player/lobby/round state
function validateSubmittedMoves(
  lobby: IGetLobbyByIdResult,
  round: IGetRoundDataResult,
  input: SubmittedMovesInput,
  player: WalletAddress,
  newMove: string
): boolean {
  // If lobby not active or existing
  if (!lobby || lobby.lobby_state !== 'active') return false;

  // If practice address 0x0 is bot player
  if (lobby.practice && player === '0x0') {
  } else {
    // If user does not belong to lobby
    const lobby_players = [lobby.lobby_creator, lobby.player_two];
    if (!lobby_players.includes(player)) return false;
  }

  // Verify fetched round exists
  if (!round) return false;

  // If moves submitted don't target the current round
  if (input.roundNumber !== lobby.current_round) return false;

  // If a move is sent that doesn't fit in the lobby grid size or is strictly invalid
  const isPlayerOne = lobby.lobby_creator === player;

  const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);

  return rps.isValidMove(isPlayerOne, newMove as RPSActions, round.round_within_match);
}

// State transition when scheduled data is processed
export const scheduledData = async (
  blockHeight: number,
  input: ScheduledDataInput,
  dbConn: Pool,
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> => {
  // This executes 'zombie rounds', rounds which have reached the specified timeout time per round.
  if (isZombieRound(input)) {
    return zombieRound(blockHeight, input.lobbyID, dbConn, randomnessGenerator);
  }
  // Update the users stats
  if (isUserStats(input)) {
    return updateStats(input.user, input.result, dbConn);
  }
  return [];
};

// State transition when a zombie round input is processed
export const zombieRound = async (
  blockHeight: number,
  lobbyId: string,
  dbConn: Pool,
  randomnessGenerator: Prando
): Promise<SQLUpdate[]> => {
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyId }, dbConn);
  const [round] = await getRoundData.run(
    { lobby_id: lobby.lobby_id, round_number: lobby.current_round },
    dbConn
  );
  const cachedMoves = await getCachedMoves.run({ lobby_id: lobbyId }, dbConn);

  console.log(`Executing zombie round (#${lobby.current_round}) for lobby ${lobby.lobby_id}`);

  // We call the execute round function passing the unexecuted moves from the database, if any.
  // In practice for chess, there will be no cached moves as only one player goes per turn
  // and the round is instantly executed. As such this will simply proceed to the next round.
  return executeRound(blockHeight, lobby, cachedMoves, round, randomnessGenerator);
};

// State transition when an update stats input is processed
export const updateStats = async (
  player: WalletAddress,
  result: ShortNotationGameResult,
  dbConn: Pool
): Promise<SQLUpdate[]> => {
  const [stats] = await getUserStats.run({ wallet: player }, dbConn);
  // Verify coherency that the user has existing stats which can be updated
  if (stats) {
    const query = persistStatsUpdate(player, result, stats);
    console.log(`Updating stats of ${player}`, query[1]);
    return [query];
  } else return [];
};

// Runs the round executor and produces the necessary SQL updates as a result
export function executeRound(
  blockHeight: number,
  lobby: IGetLobbyByIdResult,
  moves: IGetRoundMovesResult[],
  roundData: IGetRoundDataResult,
  randomnessGenerator: Prando
): SQLUpdate[] {
  // We initialize the round executor object and run it/get the new match state via `.endState()`
  const executor = initRoundExecutor(
    lobby,
    roundData.round_within_match,
    moves,
    randomnessGenerator
  );
  const newState = executor.endState();

  const rps = new RockPaperScissors(newState.moves_rps);
  const roundStats = rps.roundWinner(lobby.current_round);
  const roundInfo =
    roundStats[0] == GameResult.TIE ? 'T' : roundStats[0] == GameResult.WIN ? '1' : '2';
  const roundState = lobby.round_winner + roundInfo;
  // We generate updates to the lobby to apply the new match state
  const lobbyUpdate = persistUpdateMatchState(lobby.lobby_id, roundState, newState);

  // We generate updates for the executed round
  const executedRoundUpdate = persistExecutedRound(roundData, lobby, blockHeight);

  // Finalize match if game is over or we have reached the final round
  let roundResultUpdate: SQLUpdate[] = [];

  if (rps.didGameEnd()) {
    console.log(lobby.lobby_id, 'match ended, finalizing');
    roundResultUpdate = finalizeMatch(blockHeight, lobby, roundData.round_within_match, newState);
  } else {
    roundResultUpdate = persistNewRound(
      lobby.lobby_id,
      lobby.current_round,
      lobby.round_length,
      blockHeight
    );
  }

  const sqlUpdate = [lobbyUpdate, ...executedRoundUpdate, ...roundResultUpdate].filter(
    (item): item is SQLUpdate => !!item
  );

  return sqlUpdate;
}

// Finalizes the match and updates user statistics according to final score of the match
function finalizeMatch(
  blockHeight: number,
  lobby: IGetLobbyByIdResult,
  round: number,
  newState: MatchState
): SQLUpdate[] {
  const matchEnvironment = extractMatchEnvironment(lobby, round);

  // Create update which sets lobby state to 'finished'
  const endMatchTuple: SQLUpdate = [endMatch, { lobby_id: lobby.lobby_id }];

  // If practice lobby, then no extra results/stats need to be updated
  if (lobby.practice) {
    console.log(`Practice match ended, ignoring results`);
    return [endMatchTuple];
  }

  // Save the final results in the final states table
  const rps = new RockPaperScissors(newState.moves_rps);
  const results = rps.endGameResults();
  const resultsUpdate = persistMatchResults(lobby.lobby_id, results, matchEnvironment, newState);

  // Create the new scheduled data for updating user stats.
  // Stats are updated with scheduled data to support parallelism safely.
  const statsUpdate1 = scheduleStatsUpdate(
    matchEnvironment.user1.wallet,
    results[0],
    blockHeight + 1
  );

  const statsUpdate2 = scheduleStatsUpdate(
    matchEnvironment.user2.wallet,
    results[1],
    blockHeight + 1
  );
  return [endMatchTuple, resultsUpdate, statsUpdate1, statsUpdate2];
}
