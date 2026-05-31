import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";
import { runPreparedQuery } from "@effectstream/db";
import {
  getLobbyById,
  getLobbyPlayers,
  getUserStats,
  getOwnedCards,
  getCardPacks,
  getTradeNft,
} from "@trading-cards/database";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Get a lobby by id, with its players (in-match card state) included.
  server.get("/lobby/:lobbyId", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const [lobby] = await runPreparedQuery(
        getLobbyById.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyById",
      );
      if (!lobby) return reply.send(null);

      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers",
      );
      const transformedPlayers = players.map((p: any) => ({
        nftId: p.nft_id,
        turn: p.turn,
        hitPoints: p.hit_points,
        currentHand: p.current_hand,
        currentBoard: p.current_board,
        currentResult: p.current_result,
      }));
      return reply.send({ ...lobby, players: transformedPlayers });
    } catch (error) {
      console.error("Error fetching lobby:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get the players of a lobby.
  server.get("/lobby/:lobbyId/players", async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    try {
      const players = await runPreparedQuery(
        getLobbyPlayers.run({ lobby_id: lobbyId }, dbConn),
        "getLobbyPlayers",
      );
      return reply.send(players);
    } catch (error) {
      console.error("Error fetching lobby players:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get a user's win/loss/tie tally.
  server.get("/stats/:nftId", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };
    try {
      const [userStats] = await runPreparedQuery(
        getUserStats.run({ nft_id: parseInt(nftId, 10) }, dbConn),
        "getUserStats",
      );
      return reply.send(
        userStats ?? {
          nft_id: parseInt(nftId, 10),
          wins: 0,
          losses: 0,
          ties: 0,
        },
      );
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get open lobbies (paginated).
  server.get("/lobbies/open", async (request, reply) => {
    const { page = 0, count = 10 } = request.query as {
      page?: number;
      count?: number;
    };
    try {
      const result = await dbConn.query(
        `SELECT * FROM lobbies
         WHERE lobby_state = 'open' AND hidden = false
         ORDER BY creation_block_height DESC
         LIMIT $1 OFFSET $2`,
        [Number(count), Number(page) * Number(count)],
      );
      return reply.send(result.rows);
    } catch (error) {
      console.error("Error fetching open lobbies:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get the cards an account NFT currently owns + the packs it has bought.
  server.get("/cards/:nftId", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };
    const id = parseInt(nftId, 10);
    try {
      const cards = await runPreparedQuery(
        getOwnedCards.run({ owner_nft_id: id }, dbConn),
        "getOwnedCards",
      );
      const packs = await runPreparedQuery(
        getCardPacks.run({ buyer_nft_id: id }, dbConn),
        "getCardPacks",
      );
      return reply.send({ nft_id: id, cards, packs });
    } catch (error) {
      console.error("Error fetching cards:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get a trade NFT and the cards bundled into it.
  server.get("/trade-nft/:nftId", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };
    try {
      const [tradeNft] = await runPreparedQuery(
        getTradeNft.run({ nft_id: parseInt(nftId, 10) }, dbConn),
        "getTradeNft",
      );
      return reply.send(tradeNft ?? null);
    } catch (error) {
      console.error("Error fetching trade NFT:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // NFTs owned by a wallet (used by the frontend to find the player's NFT id).
  server.get("/nfts", async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!wallet) {
      return reply.code(400).send({ error: "Wallet address required" });
    }
    try {
      const result = await dbConn.query(
        `SELECT nft_id FROM nft_ownership WHERE wallet_address = $1 ORDER BY nft_id`,
        [wallet.toLowerCase()],
      );
      const nfts = result.rows.map((row: { nft_id: number }) => row.nft_id);
      return reply.send({ nfts });
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for Trading Cards");
};
