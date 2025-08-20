import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paimaexample/db";
import { getEvmMidnight } from "@example/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";

// Definition of API Inputs and Outputs.
// These definition build the OpenAPI documentation.
// And allow to have type safety for the API Endpoints.
const ParamsSchema = Type.Object({});
const ResponseSchema = Type.Array(Type.Object({
  token_id: Type.String(),
  owner: Type.Union([Type.Null(), Type.String()]),
  block_height: Type.Number(),
  property_name: Type.String(),
  value: Type.String(),
  property_block_height: Type.Number(),
}));

/**
 * Example for User Defined API Routes.
 * Register custom endpoints here.
 * @param server - The Fastify instance.
 * @param dbConn - The database connection.
 */
export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get<{
    Params: Static<typeof ParamsSchema>;
    Reply: Static<typeof ResponseSchema>;
  }>("/api/erc721", async (request, reply) => {
    const result = await runPreparedQuery(
      getEvmMidnight.run(undefined, dbConn),
      "/api/erc721",
    );
    reply.send(result);
  });
};
