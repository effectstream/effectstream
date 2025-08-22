import type { WalletAddress } from "@paimaexample/utils";

// HELPERS
const getBackendUri = () => "http://localhost:9999";

function queryValueToString(value: QueryValue): string {
  if (typeof value === "string") {
    return value;
  } else if (typeof value === "number") {
    return value.toString(10);
  } else if (typeof value === "boolean") {
    return value.toString();
  } else {
    throw new Error("[queryValueToString] Invalid query value");
  }
}

export function buildQuery(endpoint: string, options: QueryOptions): string {
  const optStrings: string[] = [];
  for (let opt in options) {
    const valString = queryValueToString(options[opt]);
    optStrings.push(`${opt}=${valString}`);
  }
  if (optStrings.length === 0) {
    return endpoint;
  } else {
    return `${endpoint}?${optStrings.join("&")}`;
  }
}
// END HELPERS

export type QueryValue = string | number | boolean;
export type QueryOptions = Record<string, QueryValue>;
export function buildBackendQuery(
  endpoint: string,
  options: QueryOptions,
): string {
  return `${getBackendUri()}/${buildQuery(endpoint, options)}`;
}
export function backendQueryLobbyState(lobbyID: string): string {
  const endpoint = "api/lobby_state";
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQuerySearchLobby(
  wallet: WalletAddress,
  searchQuery: string,
  page: number,
  count?: number,
): string {
  const endpoint = "api/search_open_lobbies";
  const options: QueryOptions = { wallet, searchQuery, page };
  if (count !== undefined) {
    options.count = count;
  }

  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserLobbiesBlockheight(
  wallet: WalletAddress,
  blockHeight: number,
): string {
  const endpoint = "api/user_lobbies_blockheight";
  const options = {
    wallet,
    blockHeight,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRoundStatus(
  lobbyID: string,
  round: number,
): string {
  const endpoint = "api/round_status";
  const options = {
    lobbyID,
    round,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserStats(wallet: WalletAddress): string {
  const endpoint = "api/user_stats";
  const options = {
    wallet,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserLobbies(
  wallet: WalletAddress,
  count?: number,
  page?: number,
): string {
  const endpoint = "api/user_lobbies";
  const optsStart: QueryOptions = {};
  if (typeof count !== "undefined") {
    optsStart.count = count;
  }
  if (typeof page !== "undefined") {
    optsStart.page = page;
  }
  const options = {
    wallet,
    ...optsStart,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryOpenLobbies(
  wallet: WalletAddress,
  count?: number,
  page?: number,
): string {
  const endpoint = "api/open_lobbies";
  const options: QueryOptions = { wallet: "0xa" };
  if (typeof count !== "undefined") {
    options.count = count;
  }
  if (typeof page !== "undefined") {
    options.page = page;
  }
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRoundExecutor(
  lobbyID: string,
  round: number,
): string {
  const endpoint = "api/round_executor";
  const options = {
    lobbyID,
    round,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryMatchExecutor(lobbyID: string): string {
  const endpoint = "api/match_executor";
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRandomLobby(): string {
  const endpoint = "api/random_lobby";
  const options = {};
  return buildBackendQuery(endpoint, options);
}

export function backendQueryMatchWinner(lobbyID: string): string {
  const endpoint = "api/match_winner";
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}
