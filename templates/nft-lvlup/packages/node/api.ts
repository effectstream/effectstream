import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";
import { runPreparedQuery } from "@effectstream/db";
import { getCharacterByNftId, getUserCharacters } from "@nft-lvlup/database";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // All characters owned by a wallet, with their current level + type.
  // (Mirrors the v1 `/owned_characters` TSOA controller.)
  const ownedCharactersHandler = async (request: any, reply: any) => {
    let { wallet } = request.query as { wallet?: string };
    if (!wallet) {
      return reply.code(400).send({ error: "Wallet address required" });
    }
    wallet = wallet.toLowerCase();
    try {
      const characters = await runPreparedQuery(
        getUserCharacters.run({ address: wallet }, dbConn),
        "getUserCharacters",
      );
      return reply.send({ characters });
    } catch (error) {
      console.error("Error fetching characters:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  };
  server.get("/characters", ownedCharactersHandler);
  server.get("/owned_characters", ownedCharactersHandler);

  // A single character by its NFT token id (returns level + type + owner).
  server.get("/character/:nftId", async (request, reply) => {
    const { nftId } = request.params as { nftId: string };
    try {
      const [character] = await runPreparedQuery(
        getCharacterByNftId.run({ nft_id: nftId }, dbConn),
        "getCharacterByNftId",
      );
      return reply.send(character ?? null);
    } catch (error) {
      console.error("Error fetching character:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for NFT Level-Up");
};
