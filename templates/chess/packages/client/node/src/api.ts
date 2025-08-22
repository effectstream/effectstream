import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";
import { setupUserStats } from "./api/userStats.ts";
import { setupUserLobbiesBlockheight } from "./api/userLobbiesBlockheight.ts";
import { setupUserLobbies } from "./api/userLobbies.ts";
import { setupSearchOpenLobbies } from "./api/searchOpenLobbies.ts";
import { setupRoundStatus } from "./api/roundStatus.ts";
import { setupRoundExecutor } from "./api/roundExecutor.ts";
import { setupRandomLobby } from "./api/randomLobby.ts";
import { setupRandomActiveLobby } from "./api/randomActiveLobby.ts";
import { setupOpenLobbies } from "./api/openLobbies.ts";
import { setupMatchWinner } from "./api/matchWinner.ts";
import { setupMatchExecutor } from "./api/matchExecutor.ts";
import { setupLobbyState } from "./api/lobbyState.ts";

export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  setupUserStats(server, dbConn);
  setupUserLobbiesBlockheight(server, dbConn);
  setupUserLobbies(server, dbConn);
  setupSearchOpenLobbies(server, dbConn);
  setupRoundStatus(server, dbConn);
  setupRoundExecutor(server, dbConn);
  setupRandomLobby(server, dbConn);
  setupRandomActiveLobby(server, dbConn);
  setupOpenLobbies(server, dbConn);
  setupMatchWinner(server, dbConn);
  setupMatchExecutor(server, dbConn);
  setupLobbyState(server, dbConn);
};
