import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";
import { getUserStats, getWorldStats } from "@world-map-2d/db";

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
      const [userStats] = await getUserStats.run({ wallet }, dbConn);
      return reply.send(userStats || null);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // Get world stats endpoint
  server.get("/world_stats", async (request, reply) => {
    const { x, y } = request.query as { x: string; y: string };
    if (x === undefined || y === undefined) {
      return reply.code(400).send({ error: "x and y parameters required" });
    }

    try {
      const [worldStats] = await getWorldStats.run(
        { x: parseInt(x), y: parseInt(y) },
        dbConn
      );
      return reply.send(worldStats || null);
    } catch (error) {
      console.error("Error fetching world stats:", error);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  console.log("API routes registered for World Map 2D");
};
