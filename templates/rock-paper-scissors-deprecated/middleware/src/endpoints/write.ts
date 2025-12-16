import { ENV, retryPromise } from '@paima/sdk/utils';
import { builder } from '@paima/sdk/concise';
import {
  PaimaMiddlewareErrorCode,
  awaitBlock,
  postConciselyEncodedData,
  getDefaultActiveAddress,
} from '@paima/sdk/mw-core';
import type { EndpointErrorFxn, FailedResult, OldResult, Result } from '@paima/sdk/mw-core';

import { buildEndpointErrorFxn, MiddlewareErrorCode } from '../errors';
import { getLobbyStateWithUser, getNonemptyNewLobbies } from '../helpers/auxiliary-queries';
import { lobbyWasClosed, userCreatedLobby, userJoinedLobby } from '../helpers/utility-functions';
import type { MatchMove } from '@game/game-logic';
import type { CreateLobbySuccessfulResponse } from '../types';

const RETRY_PERIOD = 1000;
const RETRIES_COUNT = 8;

const getUserWallet = (errorFxn: EndpointErrorFxn): Result<string> => {
  try {
    const wallet = getDefaultActiveAddress();
    if (wallet.length === 0) {
      return errorFxn(PaimaMiddlewareErrorCode.WALLET_NOT_CONNECTED);
    }
    return { result: wallet, success: true };
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.INTERNAL_INVALID_POSTING_MODE, err);
  }
};

async function createLobby(
  numberOfRounds: number,
  roundLength: number,
  isHidden = false,
  isPractice = false
): Promise<CreateLobbySuccessfulResponse | FailedResult> {
  const errorFxn = buildEndpointErrorFxn('createLobby');

  const query = getUserWallet(errorFxn);
  if (!query.success) return query;
  const userWalletAddress = query.result;

  const conciseBuilder = builder.initialize(undefined);
  conciseBuilder.setPrefix('c');
  conciseBuilder.addValues([
    { value: numberOfRounds.toString(10) },
    { value: roundLength.toString(10) },
    { value: isHidden ? 'T' : '' },
    { value: isPractice ? 'T' : '' },
  ]);

  let currentBlockVar: number;
  try {
    const result = await postConciselyEncodedData(conciseBuilder.build());
    if (!result.success) {
      return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, result.errorMessage);
    }
    currentBlockVar = result.result;

    if (currentBlockVar < 0) {
      return errorFxn(
        PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN,
        `Received block height: ${currentBlockVar}`
      );
    }
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, err);
  }
  const currentBlock = currentBlockVar;

  try {
    await awaitBlock(currentBlock);
    const newLobbies = await retryPromise(
      () => getNonemptyNewLobbies(userWalletAddress, currentBlock),
      RETRY_PERIOD,
      RETRIES_COUNT
    );
    if (
      !newLobbies.hasOwnProperty('lobbies') ||
      !Array.isArray(newLobbies.lobbies) ||
      newLobbies.lobbies.length === 0
    ) {
      return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CREATION);
    } else {
      return {
        success: true,
        lobbyID: newLobbies.lobbies[0].lobby_id,
        lobbyStatus: 'open',
      };
    }
  } catch (err) {
    return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CREATION, err);
  }
}

async function joinLobby(lobbyID: string): Promise<OldResult> {
  const errorFxn = buildEndpointErrorFxn('joinLobby');

  const query = getUserWallet(errorFxn);
  if (!query.success) return query;
  const userWalletAddress = query.result;

  const conciseBuilder = builder.initialize(undefined);
  conciseBuilder.setPrefix('j');
  conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });

  let currentBlockVar: number;
  try {
    const result = await postConciselyEncodedData(conciseBuilder.build());
    if (!result.success) {
      return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, result.errorMessage);
    }
    currentBlockVar = result.result;

    if (currentBlockVar < 0) {
      return errorFxn(
        PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN,
        `Received block height: ${currentBlockVar}`
      );
    }
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, err);
  }
  const currentBlock = currentBlockVar;

  try {
    await awaitBlock(currentBlock);
    const lobbyState = await retryPromise(
      () => getLobbyStateWithUser(lobbyID, userWalletAddress),
      RETRY_PERIOD,
      RETRIES_COUNT
    );
    if (userJoinedLobby(userWalletAddress, lobbyState)) {
      return {
        success: true,
        message: '',
      };
    } else if (userCreatedLobby(userWalletAddress, lobbyState)) {
      return errorFxn(MiddlewareErrorCode.CANNOT_JOIN_OWN_LOBBY);
    } else {
      return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_JOIN);
    }
  } catch (err) {
    return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_JOIN);
  }
}

async function closeLobby(lobbyID: string): Promise<OldResult> {
  const errorFxn = buildEndpointErrorFxn('closeLobby');

  const query = getUserWallet(errorFxn);
  if (!query.success) return query;
  const userWalletAddress = query.result;

  const conciseBuilder = builder.initialize(undefined);
  conciseBuilder.setPrefix('cs');
  conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });

  let currentBlockVar: number;
  try {
    const result = await postConciselyEncodedData(conciseBuilder.build());
    if (!result.success) {
      return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, result.errorMessage);
    }
    currentBlockVar = result.result;

    if (currentBlockVar < 0) {
      return errorFxn(
        PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN,
        `Received block height: ${currentBlockVar}`
      );
    }
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, err);
  }
  const currentBlock = currentBlockVar;

  try {
    await awaitBlock(currentBlock);
    const lobbyState = await retryPromise(
      () => getLobbyStateWithUser(lobbyID, userWalletAddress),
      RETRY_PERIOD,
      RETRIES_COUNT
    );
    if (lobbyWasClosed(lobbyState)) {
      return { success: true, message: '' };
    } else if (!userCreatedLobby(userWalletAddress, lobbyState)) {
      return errorFxn(MiddlewareErrorCode.CANNOT_CLOSE_SOMEONES_LOBBY);
    } else {
      return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CLOSE);
    }
  } catch (err) {
    return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CLOSE);
  }
}

async function submitMoves(
  lobbyID: string,
  roundNumber: number,
  move: MatchMove
): Promise<OldResult> {
  const errorFxn = buildEndpointErrorFxn('submitMoves');

  const query = getUserWallet(errorFxn);
  if (!query.success) return query;
  const userWalletAddress = query.result;

  const conciseBuilder = builder.initialize(undefined);
  conciseBuilder.setPrefix('s');
  conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });
  conciseBuilder.addValue({ value: roundNumber.toString(10) });
  try {
    conciseBuilder.addValue({ value: move });
  } catch (err) {
    return errorFxn(MiddlewareErrorCode.SUBMIT_MOVES_INVALID_MOVES, err);
  }

  try {
    const result = await postConciselyEncodedData(conciseBuilder.build());
    if (result.success) {
      return { success: true, message: '' };
    } else {
      return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN);
    }
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, err);
  }
}

export const writeEndpoints = {
  createLobby,
  joinLobby,
  closeLobby,
  submitMoves,
};
