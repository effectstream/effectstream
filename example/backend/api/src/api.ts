import type { FastifyInstance } from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paima/db";
import {
  getStateMachineInput,
  getStateMachineInputByBlockHeight,
} from "@example/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paima/runtime";

// Defintion of API Inputs and Outputs.
// These defintion build the OpenAPI documentation.
// And allow to have type safety for the API Endpoints.
const ParamsSchema = Type.Object({
  blockHeight: Type.Optional(Type.Number()),
});

type ParamsType = Static<typeof ParamsSchema>;
const ResponseSchema = Type.Array(Type.Object({
  block_height: Type.Number(),
  id: Type.Number(),
  inputs: Type.String(),
}));

/**
 * Example for User Defined API Routes.
 * Register custom endpoints here.
 * @param server - The Fastify instance.
 * @param dbConn - The database connection.
 */
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get<{
    Params: ParamsType;
  }>("/api/my-game-state", {
    schema: {
      tags: ["user"],
      params: ParamsSchema,
      response: {
        200: ResponseSchema,
      },
    },
  }, async (request) => {
    const blockHeight = request.params.blockHeight;
    if (blockHeight) {
      return await runPreparedQuery(
        getStateMachineInputByBlockHeight.run({
          block_height: blockHeight,
        }, dbConn),
        "getStateMachineInputByBlockHeight",
      );
    } else {
      return await runPreparedQuery(
        getStateMachineInput.run(undefined, dbConn),
        "getStateMachineInput",
      );
    }
  });
};
