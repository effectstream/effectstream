import { type Static, Type } from "@sinclair/typebox";
import { getLobbyById, getMatchSeeds, getMovesByLobby } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

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

const MoveSchema = Type.Object({
  id: Type.Number(),
  lobby_id: Type.String(),
  move_pgn: Type.String(),
  round: Type.Number(),
  wallet: Type.String(),
});

const SeedSchema = Type.Object({
  seed: Type.String(),
  block_height: Type.Number(),
  round: Type.Number(),
});

const MatchExecutorDataSchema = Type.Object({
  lobby: LobbySchema,
  seeds: Type.Array(SeedSchema),
  moves: Type.Array(MoveSchema),
});

const ResponseSchema = Type.Union([MatchExecutorDataSchema, Type.Null()]);

export function setupMatchExecutor(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/match_executor", async (request, reply) => {
    const { lobbyID } = request.query;
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) {
      reply.send(null);
      return;
    }

    const rounds = await getMatchSeeds.run({ lobby_id: lobbyID }, dbConn);
    const seeds = rounds.map((round) => ({
      seed: round.starting_block_height.toString(), // TODO We don't have the seed,
      block_height: round.starting_block_height, // .block_height, ?
      round: round.round_within_match,
    }));
    const moves = await getMovesByLobby.run({ lobby_id: lobbyID }, dbConn);
    reply.send({ lobby, seeds, moves });
  });
}
