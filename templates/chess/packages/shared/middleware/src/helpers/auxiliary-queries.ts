// import type { FailedResult } from '@paimaexample/sdk/mw-core';
// import { PaimaMiddlewareErrorCode } from '@paimaexample/sdk/mw-core';

// import { buildEndpointErrorFxn } from '../errors.ts';
import type { NewLobbies, PackedLobbyState } from "../types.ts";
import {
  FailedResult,
  userCreatedLobby,
  userJoinedLobby,
} from "./utility-functions.ts";
import {
  backendQueryLobbyState,
  backendQueryUserLobbiesBlockheight,
} from "./query-constructors.ts";
import type { LobbyState, NewLobby } from "@chess/utils";

export async function getRawLobbyState(
  lobbyID: string,
): Promise<PackedLobbyState | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getRawLobbyState");

  let res: Response;
  try {
    const query = backendQueryLobbyState(lobbyID);
    res = await fetch(query);
  } catch (err) {
    return errorFxn(
      "ERROR_QUERYING_BACKEND_ENDPOINT",
      err,
    );
  }

  try {
    const j = (await res.json()) as { lobby: LobbyState };
    return {
      success: true,
      lobby: j.lobby,
    };
  } catch (err) {
    return errorFxn(
      "INVALID_RESPONSE_FROM_BACKEND",
      err,
    );
  }
}

export async function getRawNewLobbies(
  wallet: string,
  blockHeight: number,
): Promise<NewLobbies | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getRawNewLobbies");

  let res: Response;
  try {
    const query = backendQueryUserLobbiesBlockheight(wallet, blockHeight);
    res = await fetch(query);
  } catch (err) {
    return errorFxn(
      "ERROR_QUERYING_BACKEND_ENDPOINT",
      err,
    );
  }

  try {
    const j = (await res.json()) as { lobbies: NewLobby[] };
    return {
      success: true,
      lobbies: j.lobbies,
    };
  } catch (err) {
    return errorFxn(
      "INVALID_RESPONSE_FROM_BACKEND",
      err,
    );
  }
}

export async function getNonemptyNewLobbies(
  address: string,
  blockHeight: number,
): Promise<NewLobbies> {
  const newLobbies = await getRawNewLobbies(address, blockHeight);
  if (!newLobbies.success) {
    throw new Error("Failed to get new lobbies");
  }
  if (newLobbies.lobbies.length === 0) {
    throw new Error("Received an empty list of new lobbies");
  }
  return newLobbies;
}

export async function getLobbyStateWithUser(
  lobbyID: string,
  address: string,
): Promise<PackedLobbyState> {
  const lobbyState = await getRawLobbyState(lobbyID);
  if (!lobbyState.success) {
    throw new Error("Failed to get lobby state");
  }
  if (
    userJoinedLobby(address, lobbyState) ||
    userCreatedLobby(address, lobbyState)
  ) {
    return lobbyState;
  }
  throw new Error("User is not in the lobby");
}
