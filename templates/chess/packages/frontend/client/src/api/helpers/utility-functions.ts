import type { FailedResult } from "@paimaexample/utils";
import type { Result } from "@paimaexample/utils";
import type { LobbyState } from "@chess/utils";

export type ErrorCode = number;
export type ErrorMessageMapping = Record<ErrorCode, string>;

export type ErrorMessageFxn = (errorCode: ErrorCode) => string;

export function buildEndpointErrorFxn(endpointName: string): (error1?: any, error2?: any) => FailedResult {
  return (error1, error2) => ({
    success: false,
    errorMessage: "Error in endpoint: " + endpointName + ". Error: " + (error1 ? String(error1) : "Unknown error") + (error2 ? " | " + String(error2) : ""),
    errorCode: -1,
  });
}

interface RoundEnd {
  blocks: number;
  seconds: number;
}

// END HELPERS

export function userJoinedLobby(
  address: String,
  lobbyState: LobbyState,
): boolean {
  if (!lobbyState.hasOwnProperty("player_two")) {
    return false;
  }
  if (!lobbyState.player_two || !address) {
    return false;
  }
  return lobbyState.player_two.toLowerCase() === address.toLowerCase();
}

export function userCreatedLobby(
  address: String,
  lobbyState: LobbyState,
): boolean {
  if (!lobbyState.hasOwnProperty("lobby_creator")) {
    return false;
  }
  if (!lobbyState.lobby_creator || !address) {
    return false;
  }
  return lobbyState.lobby_creator.toLowerCase() === address.toLowerCase();
}

export function lobbyWasClosed(lobby: Result<LobbyState>): boolean {
  const { lobby: lobbyState } = lobby;
  if (!lobbyState) {
    return false;
  }

  return lobbyState.lobby_state === "closed";
}

export function calculateRoundEnd(
  roundStart: number,
  roundLength: number,
  current: number,
): RoundEnd {
  const errorFxn = buildEndpointErrorFxn("calculateRoundEnd");

  let roundEnd = roundStart + roundLength;
  if (roundEnd < current) {
    errorFxn("CALCULATED_ROUND_END_IN_PAST");
    roundEnd = current;
  }

  const blocksToEnd = roundEnd - current;
  const secondsToEnd = blocksToEnd * 1000; // ENV.BLOCK_TIME;
  return {
    blocks: blocksToEnd,
    seconds: secondsToEnd,
  };
}
