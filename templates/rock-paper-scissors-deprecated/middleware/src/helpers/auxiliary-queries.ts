import type { FailedResult } from '@paima/sdk/mw-core';
import { PaimaMiddlewareErrorCode } from '@paima/sdk/mw-core';

import { buildEndpointErrorFxn } from '../errors';
import type { NewLobbies, PackedLobbyState } from '../types';
import { userCreatedLobby, userJoinedLobby } from './utility-functions';
import { backendQueryLobbyState, backendQueryUserLobbiesBlockheight } from './query-constructors';
import type { LobbyState, NewLobby } from '@game/utils';

export async function getRawLobbyState(lobbyID: string): Promise<PackedLobbyState | FailedResult> {
  const errorFxn = buildEndpointErrorFxn('getRawLobbyState');

  let res: Response;
  try {
    const query = backendQueryLobbyState(lobbyID);
    res = await fetch(query);
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_QUERYING_BACKEND_ENDPOINT, err);
  }

  try {
    const j = (await res.json()) as { lobby: LobbyState };
    return {
      success: true,
      lobby: j.lobby,
    };
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.INVALID_RESPONSE_FROM_BACKEND, err);
  }
}

export async function getRawNewLobbies(
  wallet: string,
  blockHeight: number
): Promise<NewLobbies | FailedResult> {
  const errorFxn = buildEndpointErrorFxn('getRawNewLobbies');

  let res: Response;
  try {
    const query = backendQueryUserLobbiesBlockheight(wallet, blockHeight);
    res = await fetch(query);
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_QUERYING_BACKEND_ENDPOINT, err);
  }

  try {
    const j = (await res.json()) as { lobbies: NewLobby[] };
    return {
      success: true,
      lobbies: j.lobbies,
    };
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.INVALID_RESPONSE_FROM_BACKEND, err);
  }
}

export async function getNonemptyNewLobbies(
  address: string,
  blockHeight: number
): Promise<NewLobbies> {
  const newLobbies = await getRawNewLobbies(address, blockHeight);
  if (!newLobbies.success) {
    throw new Error('Failed to get new lobbies');
  } else if (newLobbies.lobbies.length === 0) {
    throw new Error('Received an empty list of new lobbies');
  } else {
    return newLobbies;
  }
}

export async function getLobbyStateWithUser(
  lobbyID: string,
  address: string
): Promise<PackedLobbyState> {
  const lobbyState = await getRawLobbyState(lobbyID);
  if (!lobbyState.success) {
    throw new Error('Failed to get lobby state');
  } else if (userJoinedLobby(address, lobbyState) || userCreatedLobby(address, lobbyState)) {
    return lobbyState;
  } else {
    throw new Error('User is not in the lobby');
  }
}
