

import { initContract } from '@ts-rest/core';
import { Zod } from '@sinclair/typemap'
import {
  GetLobbyStateQuerystringSchema,
  GetLobbyStateResponseSchema,
  GetUserLobbiesBlockheightQuerystringSchema,
  GetUserLobbiesBlockheightResponseSchema,
  GetOpenLobbiesQuerystringSchema,
  GetOpenLobbiesResponseSchema,
  GetUserLobbiesQuerystringSchema,
  GetUserLobbiesResponseSchema,
  GetMatchExecutorQuerystringSchema,
  GetMatchExecutorResponseSchema,
  SearchOpenLobbiesQuerystringSchema,
  SearchOpenLobbiesResponseSchema,
  GetRoundStatusQuerystringSchema,
  GetRoundStatusResponseSchema,
  GetUserStatsQuerystringSchema,
  GetUserStatsResponseSchema,
  GetMatchWinnerQuerystringSchema,
  GetMatchWinnerResponseSchema,
  GetRandomActiveLobbyResponseSchema,
  GetRandomLobbyResponseSchema,
  GetRoundExecutorQuerystringSchema,
  GetRoundExecutorResponseSchema,
} from '@chess/data-types/types';

const c = initContract();

export const apiLobbyContract = c.router({
  getLobbyState: {
    method: 'GET',
    path: '/api/lobby_state',
    query: Zod(GetLobbyStateQuerystringSchema),
    responses: {
      200: Zod(GetLobbyStateResponseSchema)
    }
  },
  getUserLobbiesBlockheight: {
    method: 'GET',
    path: '/api/user_lobbies_blockheight',
    query: Zod(GetUserLobbiesBlockheightQuerystringSchema),
    responses: {
      200: Zod(GetUserLobbiesBlockheightResponseSchema)
    }
  },
  getOpenLobbies: {
    method: 'GET',
    path: '/api/open_lobbies',
    query: Zod(GetOpenLobbiesQuerystringSchema),
    responses: {
      200: Zod(GetOpenLobbiesResponseSchema),
    },
  },
  getUserLobbies: {
    method: 'GET',
    path: '/api/user_lobbies',
    query: Zod(GetUserLobbiesQuerystringSchema),
    responses: {
      200: Zod(GetUserLobbiesResponseSchema),
    },
  },
  getMatchExecutor: {
    method: 'GET',
    path: '/api/match_executor',
    query: Zod(GetMatchExecutorQuerystringSchema),
    responses: {
      200: Zod(GetMatchExecutorResponseSchema),
    },
  },
  searchOpenLobbies: {
    method: 'GET',
    path: '/api/search_open_lobbies',
    query: Zod(SearchOpenLobbiesQuerystringSchema),
    responses: {
      200: Zod(SearchOpenLobbiesResponseSchema),
    },
  },
  getRoundStatus: {
    method: 'GET',
    path: '/api/round_status',
    query: Zod(GetRoundStatusQuerystringSchema),
    responses: {
      200: Zod(GetRoundStatusResponseSchema),
    },
  },
  getUserStats: {
    method: 'GET',
    path: '/api/user_stats',
    query: Zod(GetUserStatsQuerystringSchema),
    responses: {
      200: Zod(GetUserStatsResponseSchema),
    },
  },
  getMatchWinner: {
    method: 'GET',
    path: '/api/match_winner',
    query: Zod(GetMatchWinnerQuerystringSchema),
    responses: {
      200: Zod(GetMatchWinnerResponseSchema),
    },
  },
  getRandomActiveLobby: {
    method: 'GET',
    path: '/api/random_active_lobby',
    responses: {
      200: Zod(GetRandomActiveLobbyResponseSchema),
    },
  },
  getRandomLobby: {
    method: 'GET',
    path: '/api/random_lobby',
    responses: {
      200: Zod(GetRandomLobbyResponseSchema),
    },
  },
  getRoundExecutor: {
    method: 'GET',
    path: '/api/round_executor',
    query: Zod(GetRoundExecutorQuerystringSchema),
    responses: {
      200: Zod(GetRoundExecutorResponseSchema),
    },
  },
});
