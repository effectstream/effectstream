import { getLobbyById, getRoundData, getRoundMoves } from "@chess/db";
import { getBlockHeights } from "@effectstream/db";
import type { Pool } from "pg";

export const getRoundExecutorHandler = async (
  dbConn: Pool,
  lobbyID: string,
  round: number
) => {
  if (!(round > 0)) {
    return { error: "bad round number" as const };
  }

  const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
  if (!lobby) {
    return { error: "lobby not found" as const };
  }

  const [round_data] = await getRoundData.run(
    { lobby_id: lobbyID, round_number: round },
    dbConn
  );
  if (!round_data) {
    return { error: "round not found" as const };
  }

  const [block_height] = await getBlockHeights.run(
    { block_heights: [round_data.execution_block_height!] },
    dbConn
  );
  const moves = await getRoundMoves.run(
    { lobby_id: lobbyID, round: round },
    dbConn
  );

  return {
    lobby,
    match_state: round_data.match_state,
    moves,
    block_height: {
      ...block_height,
      done: true,
    },
  };
};
