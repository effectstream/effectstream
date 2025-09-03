import { type Static, Type } from "@sinclair/typebox";
import { getOpenLobbyById, searchPaginatedOpenLobbies } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const MIN_SEARCH_LENGTH = 3;
const LOBBY_ID_LENGTH = 12;

const QuerystringSchema = Type.Object({
  wallet: Type.String(),
  searchQuery: Type.String(),
  page: Type.Optional(Type.Number({ default: 1 })),
  count: Type.Optional(Type.Number({ default: 10 })),
});

const LobbySchema = Type.Object({
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
  round_length: Type.Number(),
  rating: Type.Optional(Type.Number()), // Differences between lobby types
});

const ResponseSchema = Type.Object({
  lobbies: Type.Array(LobbySchema),
});

export function setupSearchOpenLobbies(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/search_open_lobbies", async (request, reply) => {
    let { wallet, searchQuery } = request.query;
    const { page, count } = request.query;

    if (
      searchQuery.length < MIN_SEARCH_LENGTH ||
      searchQuery.length > LOBBY_ID_LENGTH
    ) {
      reply.send({ lobbies: [] });
      return;
    }

    wallet = wallet.toLowerCase();

    if (searchQuery.length === LOBBY_ID_LENGTH) {
      const lobbies = await getOpenLobbyById.run(
        { searchQuery, wallet },
        dbConn,
      );
      reply.send({ lobbies });
      return;
    }

    const offset = (page! - 1) * count!;
    const lobbies = await searchPaginatedOpenLobbies.run(
      {
        count: `${count}`,
        page: `${offset}`,
        searchQuery: `%${searchQuery}%`,
        wallet,
      },
      dbConn,
    );
    reply.send({ lobbies });
  });
}
