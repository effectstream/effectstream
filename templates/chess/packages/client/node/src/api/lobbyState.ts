import { getLobbyById, getRoundData } from "@chess/db";
import type { Timer } from "@chess/utils";
import { updateTimer } from "@chess/utils";
import { getLobbyRounds } from "@chess/db";
import { getLatestProcessedBlockHeight } from "@effectstream/db";
import type { Pool } from "pg";

export const getLobbyStateHandler = async(dbConn: Pool, lobbyID: string) => {
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
  if (!lobby) {
    return { lobby: null };
  }

  const [[round_data], [latestBlockHeight], lobbyRounds] = await Promise.all([
    getRoundData.run(
      { lobby_id: lobbyID, round_number: lobby.current_round },
      dbConn,
    ),
    getLatestProcessedBlockHeight.run(undefined, dbConn),
    getLobbyRounds.run({ lobby_id: lobbyID }, dbConn),
  ]);

  const initialTimer: Timer = {
    player_one_blocks_left: lobby.play_time_per_player,
    player_two_blocks_left: lobby.play_time_per_player,
  };
  const latestRound = lobbyRounds[lobbyRounds.length - 1];
  const timer = updateTimer(
    latestRound ?? initialTimer,
    latestBlockHeight.block_height,
    lobby.player_one_iswhite,
  );

  return {
        lobby: {
          ...lobby,
          round_start_height: round_data?.starting_block_height || 0,
          remaining_blocks: {
            w: lobby.player_one_iswhite
              ? timer.player_one_blocks_left
              : timer.player_two_blocks_left,
            b: lobby.player_one_iswhite
              ? timer.player_two_blocks_left
              : timer.player_one_blocks_left,
          },
        },
  };
};
