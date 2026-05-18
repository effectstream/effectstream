import { runPreparedQuery } from "@effectstream/db";
import { getGateStatus, setGateStatus, getCommands } from "@batcher-validations/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get("/api/gate", async (_request, reply) => {
    const [row] = await runPreparedQuery(
      getGateStatus.run(undefined, dbConn),
      "/api/gate",
    );
    reply.send({ accepting: row?.accepting ?? true });
  });

  server.post("/api/gate", async (request, reply) => {
    const { accepting } = request.body as { accepting: boolean };
    await runPreparedQuery(
      setGateStatus.run({ accepting }, dbConn),
      "/api/gate",
    );
    reply.send({ accepting });
  });

  server.get("/api/commands", async (_request, reply) => {
    const result = await runPreparedQuery(
      getCommands.run(undefined, dbConn),
      "/api/commands",
    );
    reply.send(result);
  });
};
