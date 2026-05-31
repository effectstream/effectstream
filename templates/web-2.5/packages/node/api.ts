import { runPreparedQuery } from "@effectstream/db";
import { getUser, getAllUsers } from "@web-2.5/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // GET /api/user?wallet=0x...  -> single user record (name + experience)
  server.get("/api/user", async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param is required" });
      return;
    }
    const result = await runPreparedQuery(
      getUser.run({ wallet: wallet.toLowerCase() }, dbConn),
      "/api/user",
    );
    reply.send({ user: result[0] ?? null });
  });

  // GET /api/users -> all users, leaderboard order (descending experience)
  server.get("/api/users", async (_request, reply) => {
    const result = await runPreparedQuery(
      getAllUsers.run(undefined, dbConn),
      "/api/users",
    );
    reply.send(result);
  });
};
