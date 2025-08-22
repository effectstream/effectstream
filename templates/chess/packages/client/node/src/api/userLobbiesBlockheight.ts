import { type Static, Type } from "@sinclair/typebox";
import { getNewLobbiesByUserAndBlockHeight } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  wallet: Type.String(),
  blockHeight: Type.Number(),
});

const LobbySchema = Type.Object({
  lobby_id: Type.String(),
});

const ResponseSchema = Type.Object({
  lobbies: Type.Array(LobbySchema),
});

export function setupUserLobbiesBlockheight(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/user_lobbies_blockheight", async (request, reply) => {
    let { wallet, blockHeight } = request.query;
    wallet = wallet.toLowerCase();
    const lobbies = await getNewLobbiesByUserAndBlockHeight.run(
      { wallet, block_height: blockHeight },
      dbConn,
    );
    reply.send({ lobbies });
  });
}
