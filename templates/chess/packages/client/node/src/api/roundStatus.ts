import { getLobbyById, getRoundData, getRoundMoves } from "@chess/db";
import type { Pool } from "pg";

export const getRoundStatusHandler = async (
  dbConn: Pool,
  lobbyID: string,
  round: number
) => {
  const [roundData] = await getRoundData.run(
    { lobby_id: lobbyID, round_number: round },
    dbConn
  );
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);

  if (!lobby || !roundData) {
    return { error: "lobby not found" as const };
  }

  const moves = await getRoundMoves.run(
    { lobby_id: lobbyID, round: round },
    dbConn
  );
  const ids = moves.map((m) => m.wallet);

  return {
    executed: !!roundData.execution_block_height,
    usersWhoSubmittedMoves: Array.from(new Set(ids)),
    roundStarted: roundData.starting_block_height,
    roundLength: lobby.round_length,
  };
};
