import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type fastify from "fastify";
import { runPreparedQuery } from "@effectstream/db";
import { getUserStats, getAllWorldStats } from "@world-map-2d/database";

export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Get user stats endpoint
  server.get("/user_stats", async (request, reply) => {
    const { wallet } = request.query as { wallet: string };
    if (!wallet) {
      return reply.code(400).send({ error: "wallet parameter required" });
    }

    try {
      const [userStats] = await runPreparedQuery(
        getUserStats.run({ wallet }, dbConn),
        "getUserStats"
      );
      return reply.send(userStats || null);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get all world stats endpoint
  server.get("/world_stats", async (request, reply) => {
    try {
      const worldStats = await runPreparedQuery(
        getAllWorldStats.run(undefined, dbConn),
        "getAllWorldStats"
      );
      return reply.send(worldStats);
    } catch (error) {
      console.error("Error fetching world stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for World Map 2D");
};
