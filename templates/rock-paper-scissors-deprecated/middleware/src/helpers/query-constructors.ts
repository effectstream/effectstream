import type { WalletAddress } from '@paima/sdk/utils';
import type { QueryOptions } from '@paima/sdk/mw-core';
import { buildBackendQuery } from '@paima/sdk/mw-core';

export function backendQueryLobbyState(lobbyID: string): string {
  const endpoint = 'lobby_state';
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQuerySearchLobby(
  wallet: WalletAddress,
  searchQuery: string,
  page: number,
  count?: number
): string {
  const endpoint = 'search_open_lobbies';
  const options: QueryOptions = { wallet, searchQuery, page };
  if (count !== undefined) {
    options.count = count;
  }

  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserLobbiesBlockheight(
  wallet: WalletAddress,
  blockHeight: number
): string {
  const endpoint = 'user_lobbies_blockheight';
  const options = {
    wallet,
    blockHeight,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRoundStatus(lobbyID: string, round: number): string {
  const endpoint = 'round_status';
  const options = {
    lobbyID,
    round,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserStats(wallet: WalletAddress): string {
  const endpoint = 'user_stats';
  const options = {
    wallet,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryUserLobbies(
  wallet: WalletAddress,
  count?: number,
  page?: number
): string {
  const endpoint = 'user_lobbies';
  const optsStart: QueryOptions = {};
  if (typeof count !== 'undefined') {
    optsStart.count = count;
  }
  if (typeof page !== 'undefined') {
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
  page?: number
): string {
  const endpoint = 'open_lobbies';
  const options: QueryOptions = { wallet };
  if (typeof count !== 'undefined') {
    options.count = count;
  }
  if (typeof page !== 'undefined') {
    options.page = page;
  }
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRoundExecutor(lobbyID: string, round: number): string {
  const endpoint = 'round_executor';
  const options = {
    lobbyID,
    round,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryMatchExecutor(lobbyID: string): string {
  const endpoint = 'match_executor';
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}

export function backendQueryRandomLobby(): string {
  const endpoint = 'random_lobby';
  const options = {};
  return buildBackendQuery(endpoint, options);
}

export function backendQueryMatchWinner(lobbyID: string): string {
  const endpoint = 'match_winner';
  const options = {
    lobbyID,
  };
  return buildBackendQuery(endpoint, options);
}
