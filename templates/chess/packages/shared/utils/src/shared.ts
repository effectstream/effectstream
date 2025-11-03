import type { IGetLobbyByIdResult, IGetRoundDataResult } from "@chess/db";
import type { Timer } from "./types.ts";
import type { WalletAddress } from "@effectstream/utils";

export const updateTimer = (
  round: IGetRoundDataResult,
  blockHeight: number,
  playerOneStarts: boolean,
): Timer => {
  const { player_one_blocks_left, player_two_blocks_left } = round;
  const elapsedBlocks = blockHeight - round.starting_block_height;
  const playerOneTurn = isPlayerOneTurn(
    round.round_within_match,
    playerOneStarts,
  );
  const playerOneBlocksLeft = player_one_blocks_left -
    (playerOneTurn ? elapsedBlocks : 0);
  const playerTwoBlocksLeft = player_two_blocks_left -
    (playerOneTurn ? 0 : elapsedBlocks);

  return {
    player_one_blocks_left: Math.max(playerOneBlocksLeft, 0),
    player_two_blocks_left: Math.max(playerTwoBlocksLeft, 0),
  };
};

export const isPlayerOneTurn = (
  round: number,
  playerOneStarts: boolean,
): boolean =>
  (round % 2 === 1 && playerOneStarts) || (round % 2 === 0 && !playerOneStarts);

export const currentPlayer = (
  round: number,
  lobby: IGetLobbyByIdResult,
): WalletAddress => {
  // just due to how our types are setup
  if (!lobby.player_two) return lobby.lobby_creator;

  return isPlayerOneTurn(round, lobby.player_one_iswhite)
    ? lobby.lobby_creator
    : lobby.player_two;
};
