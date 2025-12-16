import type {
  IExecutedRoundParams,
  IGetFinalStateResult,
  IGetLobbyByIdResult,
  IGetRoundDataResult,
  INewMatchMoveParams,
  INewRoundParams,
  IUpdateLatestMatchStateParams,
} from '@game/db';
import { newRound } from '@game/db';
import { updateLatestMatchState } from '@game/db';
import { newFinalState } from '@game/db';
import { executedRound } from '@game/db';
import { newMatchMove } from '@game/db';
import type { MatchEnvironment, MatchResult, MatchState } from '@game/game-logic';
import type { SQLUpdate } from '@paima/node-sdk/db';
import type { WalletAddress } from '@paima/sdk/utils';
import type { SubmittedMovesInput } from '../types';
import { deleteZombieRound, scheduleZombieRound } from './zombie';

// This function inserts a new empty round in the database.
// We also schedule a future zombie round execution.
export function persistNewRound(
  lobbyId: string,
  currentRound: number,
  roundLength: number | null,
  blockHeight: number
): SQLUpdate[] {
  // Creation of the next round
  const nrParams: INewRoundParams = {
    lobby_id: lobbyId,
    round_within_match: currentRound + 1,
    starting_block_height: blockHeight,
    execution_block_height: null,
  };
  const newRoundTuple: SQLUpdate = [newRound, nrParams];

  // Scheduling of the zombie round execution in the future
  const zombie_block_height = blockHeight + (roundLength ?? 1_000_000);
  const zombieRoundUpdate: SQLUpdate = scheduleZombieRound(lobbyId, zombie_block_height);

  return [newRoundTuple, zombieRoundUpdate];
}

// Persist moves sent by player to an active match
export function persistMoveSubmission(
  player: WalletAddress,
  inputData: SubmittedMovesInput,
  lobby: IGetLobbyByIdResult
): SQLUpdate {
  const mmParams: INewMatchMoveParams = {
    lobby_id: inputData.lobbyID,
    wallet: player,
    round: lobby.current_round,
    move_rps: inputData.move_rps,
  };
  return [newMatchMove, mmParams];
}
// Persist an executed round (and delete scheduled zombie round input)
export function persistExecutedRound(
  roundData: IGetRoundDataResult,
  lobby: IGetLobbyByIdResult,
  blockHeight: number
): SQLUpdate[] {
  // We close the round by updating it with the execution blockHeight
  const exParams: IExecutedRoundParams = {
    lobby_id: lobby.lobby_id,
    round: lobby.current_round,
    execution_block_height: blockHeight,
  };
  const executedRoundTuple: SQLUpdate = [executedRound, exParams];

  // We remove the scheduled zombie round input
  if (lobby.round_length) {
    const block_height = roundData.starting_block_height + lobby.round_length;
    return [executedRoundTuple, deleteZombieRound(lobby.lobby_id, block_height)];
  } else {
    return [executedRoundTuple];
  }
}

// Persist match results in the final states table
export function persistMatchResults(
  lobbyId: string,
  results: MatchResult,
  matchEnvironment: MatchEnvironment,
  newState: MatchState
): SQLUpdate {
  const finalState: IGetFinalStateResult = {
    lobby_id: lobbyId,
    player_one_wallet: matchEnvironment.user1.wallet,
    player_one_result: results[0],
    player_two_wallet: matchEnvironment.user2.wallet,
    player_two_result: results[1],
    total_time: 0, // TODO
    game_moves: newState.moves_rps,
  };
  return [newFinalState, finalState];
}

// Update Lobby state with the updated board
export function persistUpdateMatchState(
  lobbyId: string,
  roundState: string,
  newMatchState: MatchState
): SQLUpdate {
  const params: IUpdateLatestMatchStateParams = {
    lobby_id: lobbyId,
    latest_match_state: newMatchState.moves_rps,
    round_winner: roundState,
  };
  return [updateLatestMatchState, params];
}
