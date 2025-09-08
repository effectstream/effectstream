import type {
  LobbyState,
  LobbyStateQuery,
  MatchExecutorData,
  MatchWinnerResponse,
  NewLobby,
  RoundExecutorData,
  RoundStatusData,
  UserLobby,
  UserStats,
} from "@chess/utils";

import {
  buildEndpointErrorFxn,
  calculateRoundEnd,
  userCreatedLobby,
  userJoinedLobby,
} from "../helpers/utility-functions.ts";
import {
  buildMatchExecutor,
  buildRoundExecutor,
} from "../helpers/executors.ts";
import {
  backendQueryLobbyState,
  backendQueryMatchExecutor,
  backendQueryMatchWinner,
  backendQueryOpenLobbies,
  backendQueryRandomLobby,
  backendQueryRoundExecutor,
  backendQueryRoundStatus,
  backendQuerySearchLobby,
  backendQueryUserLobbies,
  backendQueryUserLobbiesBlockheight,
  backendQueryUserStats,
} from "../helpers/query-constructors.ts";

import type { BaseRoundStatus } from "@chess/utils";

import type {
  MatchExecutor,
  MatchState,
  RoundExecutor,
  TickEvent,
} from "@chess/game-logic";
import { isPlayersTurn } from "@chess/game-logic";

import type { FailedResult, Result } from "@paimaexample/utils";

interface RoundExecutionState extends BaseRoundStatus {
  roundEndsInBlocks: number;
  roundEndsInSeconds: number;
}

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

export async function apiGetLobbyState(
  lobbyID: string,
): Promise<Result<LobbyState>> {
  const errorFxn = buildEndpointErrorFxn("getLobbyState");

  let packedLobbyState: Result<LobbyState>;
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

export async function apiGetLobbySearch(
  wallet: string,
  searchQuery: string,
  page: number,
  count?: number,
): Promise<Result<LobbyStateQuery>> {
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

export async function apiGetRoundExecutionState(
  lobbyID: string,
  round: number,
): Promise<Result<RoundExecutionState>> {
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

export async function apiGetUserStats(
  walletAddress: string,
): Promise<Result<UserStats>> {
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

export async function apiGetNewLobbies(
  wallet: string,
  blockHeight: number,
): Promise<Result<NewLobby>> {
  const errorFxn = buildEndpointErrorFxn("getNewLobbies");
  try {
    return apiGetRawNewLobbies(wallet, blockHeight);
  } catch (err) {
    return errorFxn("UNKNOWN", err);
  }
}

export async function apiGetUserLobbiesMatches(
  walletAddress: string,
  page: number,
  count?: number,
): Promise<Result<LobbyState>> {
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

export async function apiGetOpenLobbies(
  wallet: string,
  page: number,
  count?: number,
): Promise<Result<LobbyStateQuery>> {
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

export async function apiGetRandomOpenLobby(): Promise<Result<LobbyState>> {
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

export async function apiGetMatchWinner(
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

export async function apiGetRoundExecutor(
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

export async function apiGetMatchExecutor(
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

export async function getRawLobbyState(
  lobbyID: string,
): Promise<Result<LobbyState>> {
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

export async function apiGetRawNewLobbies(
  wallet: string,
  blockHeight: number,
): Promise<Result<NewLobby>> {
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

export async function apiGetNonemptyNewLobbies(
  address: string,
  blockHeight: number,
): Promise<Result<NewLobby>> {
  const newLobbies = await apiGetRawNewLobbies(address, blockHeight);
  if (!newLobbies.success) {
    throw new Error("Failed to get new lobbies");
  }
  if (newLobbies.lobbies.length === 0) {
    throw new Error("Received an empty list of new lobbies");
  }
  return newLobbies;
}

export async function apiGetLobbyStateWithUser(
  lobbyID: string,
  address: string,
): Promise<Result<LobbyState>> {
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
