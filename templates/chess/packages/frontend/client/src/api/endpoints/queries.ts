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


import type { BaseRoundStatus } from "@chess/utils";

import type {
  MatchExecutor,
  MatchState,
  RoundExecutor,
  TickEvent,
} from "@chess/game-logic";

import { isPlayersTurn } from "@chess/game-logic";

import type { Result } from "@paimaexample/utils";

interface RoundExecutionState extends BaseRoundStatus {
  roundEndsInBlocks: number;
  roundEndsInSeconds: number;
}

import { initClient } from "@ts-rest/core";
import { apiLobbyContract } from "@chess/api-contract";
export const client = initClient(apiLobbyContract, {
  baseUrl: import.meta.env.VITE_EFFECTSTREAM_NODE_URL,
});

export async function getBlockNumber(): Promise<number> {
  const response = await fetch(
    import.meta.env.VITE_EFFECTSTREAM_NODE_URL + "/rpc/evm",
    {
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
    }
  );
  const data = await response.json();
  return data.block_height;
}

export async function apiGetLobbyState(
  lobbyID: string
): Promise<Result<LobbyState>> {
  try {
    const [lobby, latestBlockHeight] = await Promise.all([
      getRawLobbyState(lobbyID),
      getBlockNumber(),
    ]);

    let [start, length] = [0, 0];

    if (lobby.lobby_state === "active") {
      start = lobby.round_start_height;
      length = lobby.round_length;
    }

    const end = calculateRoundEnd(start, length, latestBlockHeight);

    return {
      success: true,
      result: {
        ...lobby,
        round_ends_in_blocks: end.blocks,
        round_ends_in_secs: end.seconds,
      },
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetLobbySearch(
  wallet: string,
  searchQuery: string,
  page: number,
  count?: number | undefined
): Promise<Result<LobbyStateQuery[]>> {
  try {
    const response = await client.searchOpenLobbies({
      query: {
        wallet: wallet,
        searchQuery: searchQuery,
        page: page,
        count: count,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get lobby search");
  
    return {
      success: true,
      result: (response.body.lobbies ?? []) as unknown as LobbyStateQuery[],
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetRoundExecutionState(
  lobbyID: string,
  round: number
): Promise<Result<RoundExecutionState>> {
  try {
    const [response, latestBlockHeight] = await Promise.all([
      client.getRoundStatus({
        query: {
          lobbyID: lobbyID,
          round: round,
        },
      }),
      getBlockNumber(),
    ]);
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get round status");
    if ("error" in response.body) throw new Error(response.body.error);
    const { roundStarted: start, roundLength: length } = response.body;
    const end = calculateRoundEnd(start, length, latestBlockHeight);

    return {
      success: true,
      result: {
        executed: response.body.executed,
        usersWhoSubmittedMoves: response.body.usersWhoSubmittedMoves,
        roundEndsInBlocks: end.blocks,
        roundEndsInSeconds: end.seconds,
      },
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetUserStats(
  walletAddress: string
): Promise<Result<{ stats: UserStats | null, rank: string | undefined }>> {
  try {
    const response = await client.getUserStats({
      query: {
        wallet: walletAddress,
      },
    });

    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get user stats");
    return {
      success: true,
      result: {
        stats: response.body.stats,
        rank: response.body.rank,
      },
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetNewLobbies(
  wallet: string,
  blockHeight: number
): Promise<Result<NewLobby[]>> {
  const errorFxn = buildEndpointErrorFxn("getNewLobbies");
  try {
    return await apiGetRawNewLobbies(wallet, blockHeight);
  } catch (err) {
    return errorFxn("UNKNOWN", err);
  }
}

export async function apiGetUserLobbiesMatches(
  walletAddress: string,
  page: number,
  count?: number
): Promise<Result<(LobbyState & { myTurn: boolean })[]>> {
  try {
    const response = await client.getUserLobbies({
      query: {
        wallet: walletAddress,
        page: page,
        count: count,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get user lobbies matches");
    const result: (LobbyState & { myTurn: boolean })[] = response.body.lobbies.map((lobby) => ({
      ...(lobby as LobbyState),
      myTurn: isPlayersTurn(walletAddress, lobby as any),
    }));
    return {
      success: true,
      result: result,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetOpenLobbies(
  wallet: string,
  page: number,
  count?: number
): Promise<Result<LobbyStateQuery[]>> {
  try {
    const response = await client.getOpenLobbies({
      query: {
        wallet: wallet,
        page: page,
        count: count,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get open lobbies");
    return {
      success: true,
      result: (response.body.lobbies ?? []) as unknown as LobbyStateQuery[],
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetRandomOpenLobby(): Promise<Result<LobbyState>> {
  try {
    const response = await client.getRandomLobby();
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get random open lobby");
    if (!response.body.lobby) throw new Error("No open lobbies");
    return {
      success: true,
      result: response.body.lobby as unknown as LobbyState,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

// export async function apiGetMatchWinner(
//   lobbyId: string
// ): Promise<Result<MatchWinnerResponse>> {
//   try {
//     const response = await client.getMatchWinner({
//       query: {
//         lobbyID: lobbyId,
//       },
//     });
//     const ok = response.status === 200;
//     if (!ok) throw new Error("Failed to get match winner");
//     return {
//       success: true,
//       result: response.body,
//     };
//   } catch (err) {
//     return {
//       success: false,
//       errorMessage: String(err),
//     };
//   }
// }

export async function apiGetRoundExecutor(
  lobbyId: string,
  roundNumber: number
): Promise<Result<RoundExecutor<MatchState, TickEvent>>> {
  try {
    const response = await client.getRoundExecutor({
      query: {
        lobbyID: lobbyId,
        round: roundNumber,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get round executor");
    if ("error" in response.body) throw new Error(response.body.error);
    return {
      success: true,
      result: buildRoundExecutor(response.body as RoundExecutorData, roundNumber),
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetMatchExecutor(
  lobbyId: string
): Promise<Result<MatchExecutor<MatchState, TickEvent>>> {
  try {
    const response = await client.getMatchExecutor({
      query: {
        lobbyID: lobbyId,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get match executor");
    if (response.body == null) throw new Error("No match executor");
    const matchExecutor = buildMatchExecutor(response.body as MatchExecutorData)
    return {
      success: true,
      result: matchExecutor,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function getRawLobbyState(lobbyID: string): Promise<LobbyState> {
  const response = await client.getLobbyState({
    query: {
      lobbyID: lobbyID,
    },
  });
  const ok = response.status === 200;
  if (!ok) throw new Error("Failed to get lobby state");
  if (!response.body.lobby) throw new Error("Lobby not found");
  return response.body.lobby as unknown as LobbyState;
}

export async function apiGetRawNewLobbies(
  wallet: string,
  blockHeight: number
): Promise<Result<NewLobby[]>> {
  try {
    const response = await client.getUserLobbiesBlockheight({
      query: {
        wallet: wallet,
        blockHeight: blockHeight,
      },
    });
    const ok = response.status === 200;
    if (!ok) throw new Error("Failed to get new lobbies");
    return {
      success: true,
      result: response.body.lobbies,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: String(err),
    };
  }
}

export async function apiGetNonemptyNewLobbies(
  address: string,
  blockHeight: number
): Promise<Result<NewLobby[]>> {
  const newLobbies = await apiGetRawNewLobbies(address, blockHeight);
  if (!newLobbies.success) {
    throw new Error("Failed to get new lobbies");
  }
  if (newLobbies.result.length === 0) {
    throw new Error("Received an empty list of new lobbies");
  }
  return newLobbies;
}

export async function apiGetLobbyStateWithUser(
  lobbyID: string,
  address: string
): Promise<Result<LobbyState>> {
  const lobbyState = await getRawLobbyState(lobbyID);
  if (
    userJoinedLobby(address, lobbyState) ||
    userCreatedLobby(address, lobbyState)
  ) {
    return {
      success: true,
      result: lobbyState,
    };
  }
  throw new Error("User is not in the lobby");
}
