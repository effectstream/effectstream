import { getFinalState, getLobbyById } from "@chess/db";
import type { IGetFinalStateResult } from "@chess/db";
import type { Pool } from "pg";

const getWinner = (finalState: IGetFinalStateResult): string => {
  switch (finalState.player_one_result) {
    case "win":
      return finalState.player_one_wallet;
    case "loss":
      return finalState.player_two_wallet;
    default:
      return "";
  }
};

export const getMatchWinnerHandler = async (
  dbConn: Pool,
  lobbyID: string
) => {
  const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
  if (!lobby) {
    return {};
  }

  if (lobby.lobby_state !== "finished") {
    return {
      match_status: lobby.lobby_state,
    };
  }

  const [finalState] = await getFinalState.run({ lobby_id: lobbyID }, dbConn);
  if (!finalState) {
    return {
      match_status: lobby.lobby_state,
    };
  }

  return {
    match_status: "finished",
    winner_address: getWinner(finalState),
  };
};
