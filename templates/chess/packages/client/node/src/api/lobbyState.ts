import { type Static, Type } from "@sinclair/typebox";
import { getLobbyById, getRoundData } from "@chess/db";
import type { Timer } from "@chess/utils";
import { updateTimer } from "@chess/utils";
import { getLobbyRounds } from "@chess/db";
import { getLatestProcessedBlockHeight } from "@paimaexample/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  lobbyID: Type.String(),
});

const RemainingBlocksSchema = Type.Object({
  w: Type.Number(),
  b: Type.Number(),
});

const LobbyStateQuerySchema = Type.Object({
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
  round_start_height: Type.Number(),
  remaining_blocks: RemainingBlocksSchema,
});

const ResponseSchema = Type.Object({
  lobby: Type.Union([LobbyStateQuerySchema, Type.Null()]),
});

export function setupLobbyState(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/lobby_state", async (request, reply) => {
    const { lobbyID } = request.query;
    const [lobby] = await getLobbyById.run({ lobby_id: lobbyID }, dbConn);
    if (!lobby) {
      reply.send({ lobby: null });
      return;
    }

    const [[round_data], [latestBlockHeight], lobbyRounds] = await Promise.all([
      getRoundData.run(
        { lobby_id: lobbyID, round_number: lobby.current_round },
        dbConn,
      ),
      getLatestProcessedBlockHeight.run(undefined, dbConn),
      getLobbyRounds.run({ lobby_id: lobbyID }, dbConn),
    ]);

    const initialTimer: Timer = {
      player_one_blocks_left: lobby.play_time_per_player,
      player_two_blocks_left: lobby.play_time_per_player,
    };
    const latestRound = lobbyRounds[lobbyRounds.length - 1];
    const timer = updateTimer(
      latestRound ?? initialTimer,
      latestBlockHeight.block_height,
      lobby.player_one_iswhite,
    );

    reply.send({
      lobby: {
        ...lobby,
        round_start_height: round_data?.starting_block_height || 0,
        remaining_blocks: {
          w: lobby.player_one_iswhite
            ? timer.player_one_blocks_left
            : timer.player_two_blocks_left,
          b: lobby.player_one_iswhite
            ? timer.player_two_blocks_left
            : timer.player_one_blocks_left,
        },
      },
    });
  });
}
