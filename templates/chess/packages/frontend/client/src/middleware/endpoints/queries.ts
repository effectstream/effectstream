// import type { FailedResult, Result } from '@paimaexample/sdk/mw-core';
// import { PaimaMiddlewareErrorCode, getBlockNumber } from '@paimaexample/sdk/mw-core';
// import type { MatchExecutor, RoundExecutor } from '@paimaexample/sdk/executors';

import type {
  LobbyState,
  LobbyStateQuery,
  MatchExecutorData,
  MatchWinnerResponse,
  RoundExecutorData,
  RoundStatusData,
  UserLobby,
  UserStats,
} from "@chess/utils";

// import { buildEndpointErrorFxn, MiddlewareErrorCode } from '../errors.ts';
import {
  getRawLobbyState,
  getRawNewLobbies,
} from "../helpers/auxiliary-queries.ts";
import {
  buildEndpointErrorFxn,
  calculateRoundEnd,
  FailedResult,
} from "../helpers/utility-functions.ts";
import {
  buildMatchExecutor,
  buildRoundExecutor,
} from "../helpers/executors.ts";
import {
  backendQueryMatchExecutor,
  backendQueryMatchWinner,
  backendQueryOpenLobbies,
  backendQueryRandomLobby,
  backendQueryRoundExecutor,
  backendQueryRoundStatus,
  backendQuerySearchLobby,
  backendQueryUserLobbies,
  backendQueryUserStats,
} from "../helpers/query-constructors.ts";
import type {
  LobbyStates,
  NewLobbies,
  PackedLobbyState,
  PackedRoundExecutionState,
  PackedUserLobbies,
  PackedUserStats,
} from "../types.ts";
import type {
  MatchExecutor,
  MatchState,
  RoundExecutor,
  TickEvent,
} from "@chess/game-logic";
import { isPlayersTurn } from "@chess/game-logic";

export async function getBlockNumber(): Promise<number> {
  const response = await fetch("http://localhost:9999/rpc/evm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["latest", false],
      id: 1,
    }),
  });
  const data = await response.json();
  return data.block_height;
}

async function getLobbyState(
  lobbyID: string,
): Promise<PackedLobbyState | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getLobbyState");

  let packedLobbyState: PackedLobbyState | FailedResult;
  let latestBlockHeight: number;

  try {
    [packedLobbyState, latestBlockHeight] = await Promise.all([
      getRawLobbyState(lobbyID),
      getBlockNumber(),
    ]);

    if (!packedLobbyState.success) {
      return errorFxn(packedLobbyState.errorMessage);
    }
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const { lobby } = packedLobbyState;
    let [start, length] = [0, 0];

    if (lobby.lobby_state === "active") {
      start = lobby.round_start_height;
      length = lobby.round_length;
    }

    const end = calculateRoundEnd(start, length, latestBlockHeight);

    return {
      success: true,
      lobby: {
        ...lobby,
        round_ends_in_blocks: end.blocks,
        round_ends_in_secs: end.seconds,
      },
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getLobbySearch(
  wallet: string,
  searchQuery: string,
  page: number,
  count?: number,
): Promise<LobbyStates | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getLobbySearch");

  let response: Response;
  try {
    const query = backendQuerySearchLobby(wallet, searchQuery, page, count);
    response = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await response.json()) as { lobbies: LobbyStateQuery[] };
    return {
      success: true,
      lobbies: j.lobbies,
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getRoundExecutionState(
  lobbyID: string,
  round: number,
): Promise<PackedRoundExecutionState | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getRoundExecutionState");

  let res: Response;
  let latestBlockHeight: number;

  try {
    const query = backendQueryRoundStatus(lobbyID, round);
    [res, latestBlockHeight] = await Promise.all([
      fetch(query),
      getBlockNumber(),
    ]);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const roundStatus = (await res.json()) as RoundStatusData;

    const { roundStarted: start, roundLength: length } = roundStatus;
    const end = calculateRoundEnd(start, length, latestBlockHeight);
    return {
      success: true,
      round: {
        executed: roundStatus.executed,
        usersWhoSubmittedMoves: roundStatus.usersWhoSubmittedMoves,
        roundEndsInBlocks: end.blocks,
        roundEndsInSeconds: end.seconds,
      },
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getUserStats(
  walletAddress: string,
): Promise<PackedUserStats | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getUserStats");

  let res: Response;
  try {
    const query = backendQueryUserStats(walletAddress);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await res.json()) as { stats: UserStats; rank: number };
    return {
      success: true,
      stats: j.stats,
      rank: j.rank,
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getNewLobbies(
  wallet: string,
  blockHeight: number,
): Promise<NewLobbies | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getNewLobbies");
  try {
    return getRawNewLobbies(wallet, blockHeight);
  } catch (err) {
    return errorFxn("UNKNOWN", err);
  }
}

async function getUserLobbiesMatches(
  walletAddress: string,
  page: number,
  count?: number,
): Promise<PackedUserLobbies | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getUserLobbiesMatches");

  let res: Response;
  try {
    const query = backendQueryUserLobbies(walletAddress, count, page);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await res.json()) as { lobbies: UserLobby[] };
    return {
      success: true,
      lobbies: j.lobbies.map((lobby) => ({
        ...lobby,
        myTurn: isPlayersTurn(walletAddress, lobby),
      })),
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getOpenLobbies(
  wallet: string,
  page: number,
  count?: number,
): Promise<LobbyStates | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getOpenLobbies");

  let res: Response;
  try {
    const query = backendQueryOpenLobbies(wallet, count, page);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await res.json()) as { lobbies: LobbyStateQuery[] };
    return {
      success: true,
      lobbies: j.lobbies,
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getRandomOpenLobby(): Promise<PackedLobbyState | FailedResult> {
  const errorFxn = buildEndpointErrorFxn("getRandomOpenLobby");

  let res: Response;
  try {
    const query = backendQueryRandomLobby();
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await res.json()) as { lobby: LobbyState };
    if (j.lobby === null) {
      return errorFxn("NO_OPEN_LOBBIES");
    }
    return {
      success: true,
      lobby: j.lobby,
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

export interface SuccessfulResult<T> {
  success: true;
  result: T;
}

export type Result<T> = SuccessfulResult<T> | FailedResult;

async function getMatchWinner(
  lobbyId: string,
): Promise<Result<MatchWinnerResponse>> {
  const errorFxn = buildEndpointErrorFxn("getMatchWinner");

  let res: Response;
  try {
    const query = backendQueryMatchWinner(lobbyId);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  try {
    const j = (await res.json()) as MatchWinnerResponse;
    return {
      success: true,
      result: j,
    };
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }
}

async function getRoundExecutor(
  lobbyId: string,
  roundNumber: number,
): Promise<Result<RoundExecutor<MatchState, TickEvent>>> {
  const errorFxn = buildEndpointErrorFxn("getRoundExecutor");

  // Retrieve data:
  let res: Response;
  try {
    const query = backendQueryRoundExecutor(lobbyId, roundNumber);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  let data: RoundExecutorData;
  try {
    data = (await res.json()) as RoundExecutorData;
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }

  // Process data:
  try {
    const executor = buildRoundExecutor(data, roundNumber);
    return {
      success: true,
      result: executor,
    };
  } catch (err) {
    return errorFxn("UNABLE_TO_BUILD_EXECUTOR", err);
  }
}

async function getMatchExecutor(
  lobbyId: string,
): Promise<Result<MatchExecutor<MatchState, TickEvent>>> {
  const errorFxn = buildEndpointErrorFxn("getMatchExecutor");

  // Retrieve data:
  let res: Response;
  try {
    const query = backendQueryMatchExecutor(lobbyId);
    res = await fetch(query);
  } catch (err) {
    return errorFxn("ERROR_QUERYING_BACKEND_ENDPOINT", err);
  }

  let data: MatchExecutorData;
  try {
    data = (await res.json()) as MatchExecutorData;
  } catch (err) {
    return errorFxn("INVALID_RESPONSE_FROM_BACKEND", err);
  }

  // Process data:
  try {
    const executor = buildMatchExecutor(data);
    return {
      success: true,
      result: executor,
    };
  } catch (err) {
    return errorFxn("UNABLE_TO_BUILD_EXECUTOR", err);
  }
}

export const queryEndpoints = {
  getUserStats,
  getLobbyState,
  getLobbySearch,
  getRoundExecutionState,
  getRandomOpenLobby,
  getOpenLobbies,
  getUserLobbiesMatches,
  getNewLobbies,
  getMatchWinner,
  getRoundExecutor,
  getMatchExecutor,
};
