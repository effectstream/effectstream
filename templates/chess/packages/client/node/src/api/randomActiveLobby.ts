import { type Static, Type } from "@sinclair/typebox";
import { getRandomActiveLobby } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const LobbySchema = Type.Object({
  bot_difficulty: Type.Number(),
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
  player_two: Type.Union([Type.String(), Type.Null()]),
  practice: Type.Boolean(),
  round_length: Type.Number(),
});

const ResponseSchema = Type.Object({
  lobby: Type.Union([LobbySchema, Type.Null()]),
});

export function setupRandomActiveLobby(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Reply: Static<typeof ResponseSchema>;
  }>("/api/random_active_lobby", async (request, reply) => {
    const [lobby] = await getRandomActiveLobby.run(undefined, dbConn);
    const result = lobby || null;
    reply.send({ lobby: result });
  });
}
