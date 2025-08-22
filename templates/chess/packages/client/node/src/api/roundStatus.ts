import { type Static, Type } from "@sinclair/typebox";
import { getLobbyById, getRoundData, getRoundMoves } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  lobbyID: Type.String(),
  round: Type.Number(),
});

const RoundStatusDataSchema = Type.Object({
  executed: Type.Boolean(),
  usersWhoSubmittedMoves: Type.Array(Type.String()),
  roundStarted: Type.Number(),
  roundLength: Type.Number(),
});

const RoundStatusErrorSchema = Type.Object({
  error: Type.Union([
    Type.Literal("round not found"),
    Type.Literal("lobby not found"),
  ]),
});

const ResponseSchema = Type.Union([
  RoundStatusDataSchema,
  RoundStatusErrorSchema,
]);

export function setupRoundStatus(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/round_status", async (request, reply) => {
    const { lobbyID, round } = request.query;

    const [roundData] = await getRoundData.run(
      { lobby_id: lobbyID, round_number: round },
      dbConn,
    );
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);

    if (!lobby || !roundData) {
      reply.send({ error: "lobby not found" });
      return;
    }

    const moves = await getRoundMoves.run(
      { lobby_id: lobbyID, round: round },
      dbConn,
    );
    const ids = moves.map((m) => m.wallet);

    reply.send({
      executed: !!roundData.execution_block_height,
      usersWhoSubmittedMoves: Array.from(new Set(ids)),
      roundStarted: roundData.starting_block_height,
      roundLength: lobby.round_length,
    });
  });
}
