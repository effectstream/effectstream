// import type { SQLUpdate } from "@effectstream/node-sdk/db";
// import { createScheduledData, deleteScheduledData } from "@effectstream/node-sdk/db";
import { calculateBestMove } from "./ai.ts";
import type { IGetLobbyByIdResult } from "@chess/db";
import type { SubmittedMovesInput } from "../v1/types.ts";
import {
  type INewScheduledHeightDataParams,
  type IRemoveScheduledBlockDataParams,
  newScheduledHeightData,
  removeScheduledBlockData,
} from "@effectstream/db";
import { AddressType } from "@effectstream/utils";

type SQLUpdate = [any, any];

// Schedule a zombie round to be executed in the future
export function scheduleZombieRound(
  lobbyId: string,
  block_height: number,
): SQLUpdate {
  const params: INewScheduledHeightDataParams = {
    from_address: "0x0", // TODO This should be a Paima Engine Constant
    from_address_type: AddressType.NONE,
    future_block_height: block_height,
    input_data: createZombieInput(lobbyId),
  };
  return [newScheduledHeightData, params];
}

// Delete a scheduled zombie round to be executed in the future
export function deleteZombieRound(
  lobbyId: string,
  block_height: number,
): SQLUpdate {
  const params: IRemoveScheduledBlockDataParams = {
    block_height: block_height,
    input_data: createZombieInput(lobbyId),
  };
  return [removeScheduledBlockData, params];
}

// Create the zombie round input
function createZombieInput(lobbyId: string): string {
  // TODO: we don't support the "*" serial indicator for keys.
  //       it should be `*${lobbyId}`
  return JSON.stringify(["z", `${lobbyId}`]);
}

export const generateZombieMove = (
  lobby: IGetLobbyByIdResult,
): SubmittedMovesInput | null => {
  const pgnMove = calculateBestMove(lobby.latest_match_state, 0);
  if (!pgnMove) return null;

  const move: SubmittedMovesInput = {
    input: "submittedMoves",
    lobbyID: lobby.lobby_id,
    roundNumber: lobby.current_round,
    pgnMove,
  };
  return move;
};
