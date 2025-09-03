import { type Static, Type } from "@sinclair/typebox";
import { getPaginatedOpenLobbies } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  wallet: Type.String(),
  count: Type.Optional(Type.Number({ default: 10 })),
  page: Type.Optional(Type.Number({ default: 1 })),
});

const LobbySchema = Type.Object({
  created_at: Type.Date(),
  creation_block_height: Type.Number(),
  current_round: Type.Number(),
  hidden: Type.Boolean(),
  latest_match_state: Type.String(),
  lobby_creator: Type.String(),
  lobby_id: Type.String(),
  lobby_state: Type.String(),
  num_of_rounds: Type.Number(),
  play_time_per_player: Type.Number(),
  player_one_iswhite: Type.Boolean(),
  rating: Type.Number(),
  round_length: Type.Number(),
});

const ResponseSchema = Type.Object({
  lobbies: Type.Array(LobbySchema),
});

export function setupOpenLobbies(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/open_lobbies", async (request, reply) => {
    let { wallet } = request.query;
    const { count, page } = request.query;
    wallet = wallet.toLowerCase();

    const offset = (page!) * count!; // check if page is based 0 or 1
    const lobbies = await getPaginatedOpenLobbies.run(
      { count: `${count}`, page: `${offset}`, wallet },
      dbConn,
    );

    reply.send({ lobbies });
  });
}
