import type { SubmittedMovesInput } from "../v1/types.ts";
import type {
  IExecutedRoundParams,
  IGetLobbyByIdResult,
  IGetRoundDataResult,
  INewMatchMoveParams,
  INewRoundParams,
  IUpdateLatestMatchStateParams,
} from "@chess/db";
import {
  executedRound,
  newFinalState,
  newMatchMove,
  newRound,
  updateLatestMatchState,
} from "@chess/db";
import type { MatchEnvironment, MatchState } from "@chess/game-logic";
import type { WalletAddress } from "@paimaexample/utils";
import type {
  ConciseResult,
  ExpandedResult,
  MatchResult,
  Timer,
} from "@chess/utils";
import { deleteZombieRound, scheduleZombieRound } from "./zombie.ts";
import type { INewFinalStateParams } from "@chess/db";
// import type { SQLUpdate } from "@paimaexample/node-sdk/db";
type SQLUpdate = [any, any];

// This function inserts a new empty round in the database.
// We also schedule a future zombie round execution.
export function persistNewRound(
  lobbyId: string,
  currentRound: number,
  currentMatchState: string,
  timeLeft: Timer,
  roundLength: number,
  blockHeight: number,
): SQLUpdate[] {
  const nextRound = currentRound + 1;
  // Creation of the next round
  const nrParams: INewRoundParams = {
    lobby_id: lobbyId,
    round_within_match: nextRound,
    match_state: currentMatchState,
    player_one_blocks_left: timeLeft.player_one_blocks_left,
    player_two_blocks_left: timeLeft.player_two_blocks_left,
    starting_block_height: blockHeight,
    execution_block_height: null,
  };
  const newRoundTuple: SQLUpdate = [newRound, nrParams];

  // Scheduling of the zombie round execution in the future - use remaining time if shorter than round length
  const playerTimeLeft = nextRound % 2 === 1
    ? timeLeft.player_one_blocks_left
    : timeLeft.player_two_blocks_left;
  const roundTime = Math.min(roundLength, playerTimeLeft);
  const zombie_block_height = blockHeight + roundTime;
  const zombieRoundUpdate: SQLUpdate = scheduleZombieRound(
    lobbyId,
    zombie_block_height,
  );

  return [newRoundTuple, zombieRoundUpdate];
}

// Persist moves sent by player to an active match
export function persistMoveSubmission(
  player: WalletAddress,
  inputData: SubmittedMovesInput,
  lobby: IGetLobbyByIdResult,
): SQLUpdate {
  const mmParams: INewMatchMoveParams = {
    new_move: {
      lobby_id: inputData.lobbyID,
      wallet: player,
      round: lobby.current_round,
      move_pgn: inputData.pgnMove,
    },
  };
  return [newMatchMove, mmParams];
}
// Persist an executed round (and delete scheduled zombie round input)
export function persistExecutedRound(
  roundData: IGetRoundDataResult,
  lobby: IGetLobbyByIdResult,
  blockHeight: number,
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
    return [
      executedRoundTuple,
      deleteZombieRound(lobby.lobby_id, block_height),
    ];
  }
  return [executedRoundTuple];
}

const expandResult = (result: ConciseResult): ExpandedResult => {
  if (result === "w") return "win";
  if (result === "l") return "loss";
  return "tie";
};

// Persist match results in the final states table
export function persistMatchResults(
  lobbyId: string,
  results: MatchResult,
  matchEnvironment: MatchEnvironment,
  elapsedBlocks: number[],
  newState: MatchState,
): SQLUpdate {
  const params: INewFinalStateParams = {
    final_state: {
      lobby_id: lobbyId,
      player_one_iswhite: matchEnvironment.user1.color === "w",
      player_one_wallet: matchEnvironment.user1.wallet,
      player_one_result: expandResult(results[0] as ConciseResult),
      player_one_elapsed_time: elapsedBlocks[0] * 1000, // ENV.BLOCK_TIME,
      player_two_wallet: matchEnvironment.user2.wallet,
      player_two_result: expandResult(results[1] as ConciseResult),
      player_two_elapsed_time: elapsedBlocks[1] * 1000, //ENV.BLOCK_TIME,
      positions: newState.fenBoard,
    },
  };
  return [newFinalState, params];
}

// Update Lobby state with the updated board
export function persistUpdateMatchState(
  lobbyId: string,
  newMatchState: MatchState,
): SQLUpdate {
  const params: IUpdateLatestMatchStateParams = {
    lobby_id: lobbyId,
    latest_match_state: newMatchState.fenBoard,
  };
  return [updateLatestMatchState, params];
}
