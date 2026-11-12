import { runPreparedQuery } from "@effectstream/db";
import { getUser } from "@gamemaker/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

// Ported from v1 TSOA `api/src/controllers/userState.ts` (@Route('user_state')).
// Plain Fastify GET route — all writes go through the STM, the API is read-only.
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/user_state", async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!wallet) {
      return reply.code(400).send({ error: "wallet parameter required" });
    }
    const lookup = wallet.toLowerCase();
    const result = await runPreparedQuery(
      getUser.run({ wallet: lookup }, dbConn),
      "/user_state",
    );
    // Mirror the v1 controller: return a zeroed record for unknown wallets.
    reply.send(result[0] ?? { wallet: lookup, experience: 0 });
  });
};
