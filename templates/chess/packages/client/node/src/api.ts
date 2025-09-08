import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";
import { getLobbyStateHandler } from "./api/lobbyState.ts";
import { getUserLobbiesBlockheightHandler } from "./api/userLobbiesBlockheight.ts";
import { getOpenLobbiesHandler } from "./api/openLobbies.ts";
import { getUserLobbiesHandler } from "./api/userLobbies.ts";
import { getMatchExecutorHandler } from "./api/matchExecutor.ts";
import { searchOpenLobbiesHandler } from "./api/searchOpenLobbies.ts";
import { getRoundStatusHandler } from "./api/roundStatus.ts";
import { getUserStatsHandler } from "./api/userStats.ts";
import { getMatchWinnerHandler } from "./api/matchWinner.ts";
import { getRandomActiveLobbyHandler } from "./api/randomActiveLobby.ts";
import { getRandomLobbyHandler } from "./api/randomLobby.ts";
import { getRoundExecutorHandler } from "./api/roundExecutor.ts";

import { initServer } from "@ts-rest/fastify"
import { apiLobbyContract } from "@chess/api-contract";

export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  const s = initServer()
  const apiHandlers = s.router(apiLobbyContract, {
    getLobbyState: async({ query: { lobbyID} }) => {
      const lobbyState = await getLobbyStateHandler(dbConn, lobbyID)
      return {
        status: 200,
        body: lobbyState
      }
    },
    getUserLobbiesBlockheight: async ({ query: { wallet, blockHeight } }) => {
      const lobbies = await getUserLobbiesBlockheightHandler(dbConn, wallet, blockHeight);
      return {
        status: 200,
        body: lobbies,
      };
    },
    getOpenLobbies: async ({ query: { wallet, count, page } }) => {
      const lobbies = await getOpenLobbiesHandler(dbConn, wallet, count, page);
      return {
        status: 200,
        body: lobbies,
      };
    },
    getUserLobbies: async ({ query: { wallet, count, page } }) => {
      const lobbies = await getUserLobbiesHandler(dbConn, wallet, count, page);
      return {
        status: 200,
        body: lobbies,
      };
    },
    getMatchExecutor: async ({ query: { lobbyID } }) => {
      const matchData = await getMatchExecutorHandler(dbConn, lobbyID);
      return {
        status: 200,
        body: matchData,
      };
    },
    searchOpenLobbies: async ({ query }) => {
      const lobbies = await searchOpenLobbiesHandler(
        dbConn,
        query.wallet,
        query.searchQuery,
        query.page,
        query.count
      );
      return {
        status: 200,
        body: lobbies,
      };
    },
    getRoundStatus: async ({ query: { lobbyID, round } }) => {
      const roundStatus = await getRoundStatusHandler(dbConn, lobbyID, round);
      return {
        status: 200,
        body: roundStatus,
      };
    },
    getUserStats: async ({ query: { wallet } }) => {
      const userStats = await getUserStatsHandler(dbConn, wallet);
      return {
        status: 200,
        body: userStats,
      };
    },
    getMatchWinner: async ({ query: { lobbyID } }) => {
      const matchWinner = await getMatchWinnerHandler(dbConn, lobbyID);
      return {
        status: 200,
        body: matchWinner,
      };
    },
    getRandomActiveLobby: async () => {
      const lobby = await getRandomActiveLobbyHandler(dbConn);
      return {
        status: 200,
        body: lobby,
      };
    },
    getRandomLobby: async () => {
      const lobby = await getRandomLobbyHandler(dbConn);
      return {
        status: 200,
        body: lobby,
      };
    },
    getRoundExecutor: async ({ query: { lobbyID, round } }) => {
      const roundExecutor = await getRoundExecutorHandler(dbConn, lobbyID, round);
      return {
        status: 200,
        body: roundExecutor,
      };
    },
  });
  await server.register(s.plugin(apiHandlers))

};
