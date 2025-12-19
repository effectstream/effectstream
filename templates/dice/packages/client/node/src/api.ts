import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type { FastifyInstance } from "fastify";
import { runPreparedQuery } from "@paimaexample/db";
import {
  getLobbyById,
  getUserStats,
  getLobbyPlayers,
  getRound,
  getRoundMoves,
  getMatch,
} from "@dice/db";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
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

  // Get lobby players
  server.get("/lobby/:lobbyId/players", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers"
      );
      return reply.send(players);
    } catch (error) {
      console.error("Error fetching lobby players:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get user stats by NFT ID
  server.get("/stats/:nftId", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };

    try {
      const [userStats] = await runPreparedQuery(
        getUserStats.run({ nft_id: parseInt(nftId) }, dbConn),
        "getUserStats"
      );
      return reply.send(userStats || { nft_id: parseInt(nftId), wins: 0, losses: 0, ties: 0 });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get open lobbies (paginated)
  server.get("/lobbies/open", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as { page?: number; count?: number };

    try {
      const result = await dbConn.query(
        `SELECT * FROM lobbies
         WHERE lobby_state = 'open' AND hidden = false
         ORDER BY creation_block_height DESC
         LIMIT $1 OFFSET $2`,
        [Number(count), Number(page) * Number(count)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching open lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get active lobbies
  server.get("/lobbies/active", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as { page?: number; count?: number };

    try {
      const result = await dbConn.query(
        `SELECT * FROM lobbies
         WHERE lobby_state = 'active'
         ORDER BY creation_block_height DESC
         LIMIT $1 OFFSET $2`,
        [Number(count), Number(page) * Number(count)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching active lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get user lobbies by NFT ID
  server.get("/user/:nftId/lobbies", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };
    const { page = 0, count = 10 } = request.query as { page?: number; count?: number };

    try {
      const result = await dbConn.query(
        `SELECT DISTINCT l.* FROM lobbies l
         INNER JOIN lobby_player lp ON l.lobby_id = lp.lobby_id
         WHERE lp.nft_id = $1
           AND l.lobby_state IN ('active', 'finished', 'open')
         ORDER BY l.creation_block_height DESC
         LIMIT $2 OFFSET $3`,
        [parseInt(nftId), Number(count), Number(page) * Number(count)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching user lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get match data
  server.get("/lobby/:lobbyId/match/:matchId", async (request, reply) => {
    const { lobbyId, matchId } = request.params as { lobbyId: string; matchId: string };

    try {
      const [match] = await runPreparedQuery(
        getMatch.run({
          lobby_id: lobbyId,
          match_within_lobby: parseInt(matchId)
        }, dbConn),
        "getMatch"
      );
      return reply.send(match || null);
    } catch (error) {
      console.error("Error fetching match:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get round data
  server.get("/lobby/:lobbyId/match/:matchId/round/:roundId", async (request, reply) => {
    const { lobbyId, matchId, roundId } = request.params as {
      lobbyId: string;
      matchId: string;
      roundId: string;
    };

    try {
      const [round] = await runPreparedQuery(
        getRound.run({
          lobby_id: lobbyId,
          match_within_lobby: parseInt(matchId),
          round_within_match: parseInt(roundId),
        }, dbConn),
        "getRound"
      );
      return reply.send(round || null);
    } catch (error) {
      console.error("Error fetching round:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get moves for a round
  server.get("/lobby/:lobbyId/match/:matchId/round/:roundId/moves", async (request, reply) => {
    const { lobbyId, matchId, roundId } = request.params as {
      lobbyId: string;
      matchId: string;
      roundId: string;
    };

    try {
      const moves = await runPreparedQuery(
        getRoundMoves.run({
          lobby_id: lobbyId,
          match_within_lobby: parseInt(matchId),
          round_within_match: parseInt(roundId),
        }, dbConn),
        "getRoundMoves"
      );
      return reply.send(moves);
    } catch (error) {
      console.error("Error fetching moves:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get all rounds for a lobby
  server.get("/lobby/:lobbyId/rounds", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const result = await dbConn.query(
        `SELECT * FROM match_round
         WHERE lobby_id = $1
         ORDER BY match_within_lobby, round_within_match`,
        [lobbyId]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching rounds:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get all moves for a lobby
  server.get("/lobby/:lobbyId/moves", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };

    try {
      const result = await dbConn.query(
        `SELECT * FROM round_move
         WHERE lobby_id = $1
         ORDER BY match_within_lobby, round_within_match, move_within_round`,
        [lobbyId]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching moves:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for Dice Game");
};
