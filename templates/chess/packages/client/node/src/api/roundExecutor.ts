import { type Static, Type } from "@sinclair/typebox";
import { getLobbyById, getRoundData, getRoundMoves } from "@chess/db";
import { getBlockHeights } from "@paimaexample/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  lobbyID: Type.String(),
  round: Type.Number(),
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
  lobby_state: Type.String(), // Assuming lobby_status is a string enum
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

const BlockHeightSchema = Type.Object({
  seed: Type.String(),
  done: Type.Boolean(),
  block_height: Type.Number(),
});

const RoundExecutorDataSchema = Type.Object({
  lobby: LobbySchema,
  match_state: Type.String(),
  moves: Type.Array(MoveSchema),
  block_height: BlockHeightSchema,
});

const RoundExecutorErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal("lobby not found"),
    Type.Literal("bad round number"),
    Type.Literal("round not found"),
  ]),
});

const ResponseSchema = Type.Union([
  RoundExecutorDataSchema,
  RoundExecutorErrorSchema,
]);

export function setupRoundExecutor(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/round_executor", async (request, reply) => {
    const { lobbyID, round } = request.query;

    if (!(round > 0)) {
      reply.send({ error: "bad round number" });
      return;
    }

    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) {
      reply.send({ error: "lobby not found" });
      return;
    }

    const [round_data] = await getRoundData.run(
      { lobby_id: lobbyID, round_number: round },
      dbConn,
    );
    if (!round_data) {
      reply.send({ error: "round not found" });
      return;
    }

    const [block_height] = await getBlockHeights.run(
      { block_heights: [round_data.execution_block_height!] },
      dbConn,
    );
    const moves = await getRoundMoves.run(
      { lobby_id: lobbyID, round: round },
      dbConn,
    );
    reply.send({
      lobby,
      match_state: round_data.match_state,
      moves,
      block_height: {
        ...block_height,
        done: true,
      },
    });
  });
}
