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

      if (!lobby) {
        return reply.send(null);
      }

      // Fetch players for this lobby
      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers"
      );

      // Transform players to camelCase format expected by frontend
      const transformedPlayers = players.map((player: any) => ({
        nftId: player.nft_id,
        turn: player.turn,
        points: player.points,
        score: player.score,
      }));

      // Return lobby with players included
      return reply.send({ ...lobby, players: transformedPlayers });
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

  // Alias for /lobbies/open (for frontend compatibility)
  server.get("/open_lobbies", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as { page?: number; count?: number };
    const queryString = new URLSearchParams({
      page: String(page),
      count: String(count)
    }).toString();
    return reply.redirect(`/lobbies/open?${queryString}`);
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

  // Get user lobbies by wallet address (for compatibility with frontend)
  server.get("/user_lobbies", async (request, reply) => {
    const { wallet, page = 0, count = 10 } = request.query as { wallet?: string; page?: number; count?: number };

    if (!wallet) {
      return reply.code(400).send({ error: "Wallet address required" });
    }

    try {
      // First, get NFT IDs for this wallet
      const nftResult = await dbConn.query(
        `SELECT nft_id FROM nft_ownership WHERE wallet_address = $1`,
        [wallet.toLowerCase()]
      );

      // If no NFTs found in database, return empty array
      if (nftResult.rows.length === 0) {
        return reply.send([]);
      }

      const nftIds = nftResult.rows.map((row: { nft_id: number }) => row.nft_id);

      // Then get lobbies for those NFT IDs
      const result = await dbConn.query(
        `SELECT DISTINCT l.* FROM lobbies l
         INNER JOIN lobby_player lp ON l.lobby_id = lp.lobby_id
         WHERE lp.nft_id = ANY($1::int[])
           AND l.lobby_state IN ('active', 'finished', 'open')
         ORDER BY l.creation_block_height DESC
         LIMIT $2 OFFSET $3`,
        [nftIds, Number(count), Number(page) * Number(count)]
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching user lobbies:", error);
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

  // Alias for user/:nftId/lobbies using query parameter format
  server.get("/user_lobbies_by_nft", async (request, reply) => {
    const { nft_id, page = 0, count = 10 } = request.query as { nft_id?: string; page?: number; count?: number };

    if (!nft_id) {
      return reply.code(400).send({ error: "NFT ID required" });
    }

    const queryString = new URLSearchParams({
      page: String(page),
      count: String(count)
    }).toString();
    return reply.redirect(`/user/${nft_id}/lobbies?${queryString}`);
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

    // Validate that roundId and matchId are valid integers
    const parsedMatchId = parseInt(matchId);
    const parsedRoundId = parseInt(roundId);

    if (isNaN(parsedMatchId) || isNaN(parsedRoundId)) {
      return reply.code(400).send({ error: "Invalid match or round ID" });
    }

    try {
      const moves = await runPreparedQuery(
        getRoundMoves.run({
          lobby_id: lobbyId,
          match_within_lobby: parsedMatchId,
          round_within_match: parsedRoundId,
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

  // Get NFTs owned by wallet
  server.get("/nfts", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };

    if (!wallet) {
      return reply.code(400).send({ error: "Wallet address required" });
    }

    try {
      // Query custom nft_ownership table populated by nftMint state transition
      const result = await dbConn.query(
        `SELECT nft_id FROM nft_ownership WHERE wallet_address = $1 ORDER BY nft_id`,
        [wallet.toLowerCase()]
      );

      const nfts = result.rows.map((row: { nft_id: number }) => row.nft_id);
      return reply.send({ nfts });
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
};
