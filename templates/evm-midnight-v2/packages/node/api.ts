import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@effectstream/db";
import { evmMidnightTableExists, getEvmMidnight } from "@evm-midnight/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

const ResponseSchema = Type.Array(Type.Object({
  token_id: Type.String(),
  owner: Type.Union([Type.Null(), Type.String()]),
  block_height: Type.Number(),
  property_name: Type.String(),
  value: Type.String(),
  property_block_height: Type.Number(),
}));
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get<{
    Reply: Static<typeof ResponseSchema>;
  }>("/api/erc721", async (_request, reply) => {
    const [tableExists] = await runPreparedQuery(evmMidnightTableExists.run(undefined, dbConn), "evmMidnightTableExists");
    if (!tableExists?.exists) {
      reply.send([]);
      return;
    }

    const result = await runPreparedQuery(
      getEvmMidnight.run(undefined, dbConn),
      "/api/erc721",
    );

    reply.send(result);
  });
};
