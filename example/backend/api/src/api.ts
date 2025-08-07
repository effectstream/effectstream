import type { FastifyInstance } from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paima/db";
import {
  getStateMachineInput,
  getStateMachineInputByBlockHeight,
  getStateMachineInputByBlockHeightCount,
  getStateMachineInputCount,
} from "@example/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paima/runtime";
import {
  createPaginatedResponseSchema,
  createPaginationMeta,
  getPaginationParams,
  PaginationQuerySchema,
} from "@paima/runtime";

// Defintion of API Inputs and Outputs.
// These defintion build the OpenAPI documentation.
// And allow to have type safety for the API Endpoints.
const ParamsSchema = Type.Object({
  blockHeight: Type.Optional(Type.Number()),
});

type ParamsType = Static<typeof ParamsSchema>;
const ResponseSchema = createPaginatedResponseSchema(Type.Object({
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
    Querystring: any;
  }>("/api/my-game-state", {
    schema: {
      tags: ["user"],
      params: ParamsSchema,
      querystring: PaginationQuerySchema,
      response: {
        200: ResponseSchema,
      },
    },
  }, async (request) => {
    const { limit, skip, count } = getPaginationParams(request);
    const blockHeight = request.params.blockHeight;
    const query = request.query as any;

    // Only pass pagination params if they were provided in the request
    const paginationParams =
      (query.limit !== undefined || query.skip !== undefined)
        ? { limit, skip }
        : {};

    if (blockHeight) {
      const queryParams = {
        block_height: blockHeight,
        ...paginationParams,
      };

      // Only run count query if explicitly requested
      const dataPromise = runPreparedQuery(
        getStateMachineInputByBlockHeight.run(queryParams, dbConn),
        "getStateMachineInputByBlockHeight",
      );

      const countPromise = count
        ? runPreparedQuery(
          getStateMachineInputByBlockHeightCount.run({
            block_height: blockHeight,
          }, dbConn),
          "getStateMachineInputByBlockHeightCount",
        )
        : undefined;

      const [data, countResult] = await Promise.all([
        dataPromise,
        countPromise,
      ]);

      const total = countResult?.[0]?.total;
      const pagination = createPaginationMeta(limit, skip, total, data.length);

      return {
        data,
        pagination,
      };
    } else {
      // Only run count query if explicitly requested
      const dataPromise = runPreparedQuery(
        getStateMachineInput.run(paginationParams, dbConn),
        "getStateMachineInput",
      );

      const countPromise = count
        ? runPreparedQuery(
          getStateMachineInputCount.run(undefined, dbConn),
          "getStateMachineInputCount",
        )
        : undefined;

      const [data, countResult] = await Promise.all([
        dataPromise,
        countPromise,
      ]);

      const total = countResult?.[0]?.total;
      const pagination = createPaginationMeta(limit, skip, total, data.length);

      return {
        data,
        pagination,
      };
    }
  });
};
