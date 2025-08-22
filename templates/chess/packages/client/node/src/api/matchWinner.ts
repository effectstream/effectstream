import { type Static, Type } from "@sinclair/typebox";
import { getFinalState, getLobbyById } from "@chess/db";
import type { IGetFinalStateResult } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

const ResponseSchema = Type.Object({
  match_status: Type.Optional(Type.String()),
  winner_address: Type.Optional(Type.String()),
});

const getWinner = (finalState: IGetFinalStateResult): string => {
  switch (finalState.player_one_result) {
    case "win":
      return finalState.player_one_wallet;
    case "loss":
      return finalState.player_two_wallet;
    default:
      return "";
  }
};

export function setupMatchWinner(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/match_winner", async (request, reply) => {
    const { lobbyID } = request.query;
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) {
      reply.send({});
      return;
    }

    if (lobby.lobby_state !== "finished") {
      reply.send({
        match_status: lobby.lobby_state,
      });
      return;
    }

    const [finalState] = await getFinalState.run({ lobby_id: lobbyID }, dbConn);
    if (!finalState) {
      reply.send({
        match_status: lobby.lobby_state,
      });
      return;
    }

    reply.send({
      match_status: "finished",
      winner_address: getWinner(finalState),
    });
  });
}
