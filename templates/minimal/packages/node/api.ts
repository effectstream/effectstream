import { runPreparedQuery } from "@effectstream/db";
import { getAllInputs } from "@minimal/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/inputs", async (_request, reply) => {
    const result = await runPreparedQuery(
      getAllInputs.run(undefined, dbConn),
      "/api/inputs",
    );
    reply.send({ inputs: result });
  });
};
