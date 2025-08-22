import { type Static, Type } from "@sinclair/typebox";
import { getPaginatedOpenLobbies, getRandomLobby } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

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
  round_length: Type.Number(),
});

const ResponseSchema = Type.Object({
  lobby: Type.Union([LobbySchema, Type.Null()]),
});

export function setupRandomLobby(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Reply: Static<typeof ResponseSchema>;
  }>("/api/random_lobby", async (request, reply) => {
    const [lobby] = await getRandomLobby.run(undefined, dbConn);
    if (lobby) {
      reply.send({ lobby });
      return;
    }

    const [backupLobby] = await getPaginatedOpenLobbies.run(
      { wallet: "", count: `1`, page: `1` },
      dbConn,
    );
    const result = backupLobby || null;
    reply.send({ lobby: result });
  });
}
