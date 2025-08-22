import { type Static, Type } from "@sinclair/typebox";
import { getUserRatingPosition, getUserStats } from "@chess/db";
import type { Pool } from "pg";
import type fastify from "fastify";

const QuerystringSchema = Type.Object({
  wallet: Type.String(),
});

const UserStatsSchema = Type.Object({
  losses: Type.Number(),
  rating: Type.Number(),
  ties: Type.Number(),
  wallet: Type.String(),
  wins: Type.Number(),
});

const ResponseSchema = Type.Object({
  stats: Type.Union([UserStatsSchema, Type.Null()]),
  rank: Type.Optional(Type.String()),
});

export function setupUserStats(
  server: fastify.FastifyInstance,
  dbConn: Pool,
): void {
  server.get<{
    Querystring: Static<typeof QuerystringSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/user_stats", async (request, reply) => {
    let { wallet } = request.query;
    wallet = wallet.toLowerCase();
    const [stats] = await getUserStats.run({ wallet }, dbConn);

    if (!stats) {
      reply.send({ stats: null });
      return;
    }

    const [ratingPosition] = await getUserRatingPosition.run({
      rating: stats.rating,
    }, dbConn);
    reply.send({ stats, rank: ratingPosition?.rank ?? undefined });
  });
}
