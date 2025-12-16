import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";
import { runPreparedQuery } from "@paimaexample/db";
import {
  getLobbyById,
  getUserStats,
  getPaginatedOpenLobbies,
  getUserLobbies,
  getRoundData,
  getCachedMoves,
  getFinalMatchState,
  getAllRounds,
} from "@rock-paper-scissors/db";

export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  // Add CORS headers for all routes
  server.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  });

  // Get lobby by ID
  server.get("/lobby/:lobbyId", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const [lobby] = await runPreparedQuery(
        getLobbyById.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyById"
      );
      return reply.send(lobby || null);
    } catch (error) {
      console.error("Error fetching lobby:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get user stats
  server.get("/user_stats", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    if (!wallet) {
      return reply.code(400).send({ error: "wallet parameter required" });
    }

    try {
      const [userStats] = await runPreparedQuery(
        getUserStats.run({ wallet }, dbConn),
        "getUserStats"
      );
      return reply.send(userStats || { wallet, wins: 0, losses: 0, ties: 0 });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get open lobbies (paginated)
  server.get("/open_lobbies", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as { page?: number; count?: number };

    try {
      const result = await dbConn.query(
        `SELECT * FROM lobbies
         WHERE lobby_state = 'open' AND hidden = false
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [Number(count), Number(page)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching open lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get user lobbies (active + finished, paginated)
  server.get("/user_lobbies", async (request, reply) => {
    const { wallet, page = 0, count = 10 } = request.query as {
      wallet: string;
      page?: number;
      count?: number;
    };

    if (!wallet) {
      return reply.code(400).send({ error: "wallet parameter required" });
    }

    try {
      const result = await dbConn.query(
        `SELECT * FROM lobbies
         WHERE (lobby_creator = $1 OR player_two = $1)
           AND lobby_state IN ('active', 'finished', 'open')
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [wallet, Number(count), Number(page)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching user lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get round data
  server.get("/lobby/:lobbyId/round/:round", async (request, reply) => {
    const { lobbyId, round } = request.params as { lobbyId: string; round: string };

    try {
      const [roundData] = await runPreparedQuery(
        getRoundData.run({ lobby_id: lobbyId, round: Number(round) }, dbConn),
        "getRoundData"
      );
      return reply.send(roundData || null);
    } catch (error) {
      console.error("Error fetching round data:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get moves for a round
  server.get("/lobby/:lobbyId/round/:round/moves", async (request, reply) => {
    const { lobbyId, round } = request.params as { lobbyId: string; round: string };

    try {
      const moves = await runPreparedQuery(
        getCachedMoves.run({ lobby_id: lobbyId, round: Number(round) }, dbConn),
        "getCachedMoves"
      );
      return reply.send(moves);
    } catch (error) {
      console.error("Error fetching moves:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get final match state
  server.get("/lobby/:lobbyId/final", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const [finalState] = await runPreparedQuery(
        getFinalMatchState.run({ lobby_id: lobbyId }, dbConn),
        "getFinalMatchState"
      );
      return reply.send(finalState || null);
    } catch (error) {
      console.error("Error fetching final match state:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get all rounds for a lobby
  server.get("/lobby/:lobbyId/rounds", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const rounds = await runPreparedQuery(
        getAllRounds.run({ lobby_id: lobbyId }, dbConn),
        "getAllRounds"
      );
      return reply.send(rounds);
    } catch (error) {
      console.error("Error fetching rounds:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for Rock-Paper-Scissors");
};
