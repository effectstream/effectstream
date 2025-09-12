import { getLobbyById, getMatchSeeds, getMovesByLobby } from "@chess/db";
import type { Pool } from "pg";

export const getMatchExecutorHandler = async (
  dbConn: Pool,
  lobbyID: string
) => {
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
  if (!lobby) {
    return null;
  }

  const rounds = await getMatchSeeds.run({ lobby_id: lobbyID }, dbConn);
  const seeds = rounds.map((round) => ({
    seed: round.starting_block_height.toString(), // TODO We don't have the seed,
    block_height: round.starting_block_height, // .block_height, ?
    round: round.round_within_match,
  }));
  const moves = await getMovesByLobby.run({ lobby_id: lobbyID }, dbConn);
  return { lobby, seeds, moves };
};
