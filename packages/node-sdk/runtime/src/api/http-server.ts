import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import {
  aquireDBMutex,
  getAllAddresses,
  getAllAddressesCount,
  getAllScheduledData,
  getAllScheduledDataCount,
  getPrimitivePrefix,
  getTableSchema,
  releaseDBMutex,
  runPreparedQuery,
} from "@paima/db";
import { ENV } from "@paima/utils";
import type { AllSyncProtocols } from "@paima/sync";
import fastifySwagger, {
  type FastifyDynamicSwaggerOptions,
} from "@fastify/swagger";
import fastifySwaggerUi, {
  type FastifySwaggerUiOptions,
} from "@fastify/swagger-ui";
import { Type } from "@sinclair/typebox";
import type { StartConfigApiRouter } from "../types.ts";
import type { GrammarDefinition } from "@paima/concise";
import {
  createPaginatedResponseSchema,
  createPaginationMeta,
  getPaginationParams,
  PaginationQuerySchema,
} from "./pagination.ts";

export enum RpcPaths {
  Root = "rpc",
  EVM = "evm",
}
/**
 * Register the OpenAPI documentation for the Paima Engine HTTP server.
 * Documentation is available at /documentation /documentation/json /documentation/yaml
 * @param server - The Fastify instance.
 * @param port - The port to listen on.
 */
function* registerOpenApiDocumentation(
  server: FastifyInstance,
  port: number,
) {
  // Generate OpenAPI documentation
  // Documentation is available at /documentation /documentation/json /documentation/yaml
  const openApiOptions: FastifyDynamicSwaggerOptions = {
    openapi: {
      info: {
        title: "Paima Engine",
        description: "Paima Engine API",
        version: "0.1.0",
      },
      tags: [
        {
          name: "user",
          description: "Paima Engine User related end-points",
        },
        {
          name: "status",
          description: "Paima Engine Status related end-points",
        },
        {
          name: "developer",
          description: "Developer related end-points",
        },
      ],
      servers: [
        {
          url: `http://localhost:${port}`,
          description: "Local Paima Engine",
        },
      ],
    },
    hideUntagged: true,
  };

  const uiOptions: FastifySwaggerUiOptions = {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => {
      return header.replace(/ frame-ancestors 'self';/, "");
    },
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
    theme: {
      css: [
        {
          filename: "custom.css",
          content: `
          .swagger-ui .topbar {
            display: none;
          }
        `,
        },
      ],
    },
  };

  yield* until(server.register(fastifySwagger, openApiOptions));

  yield* until(server.register(fastifySwaggerUi, uiOptions));
}

// TODO This should add user defined endpoints.
/**
 * Start the Paima Engine HTTP server.
 * @param dbConn - The database connection.
 * @param syncProtocols - The sync protocols.
 */
export const startHttpServer = function* (
  dbConn: Pool,
  syncProtocols: AllSyncProtocols[],
  apiRouter?: StartConfigApiRouter,
  grammar?: GrammarDefinition,
) {
  // Use dbConn directly; queries are executed via pgtyped PreparedQuery.run
  // Allow any webpage to access the server.
  // This node is not specific for a specific website.
  const server = fastify();
  // OpenAPI Docs
  yield* registerOpenApiDocumentation(server, ENV.PAIMA_API_PORT);

  yield* until(
    server.register(cors, {
      origin: "*",
    }),
  );

  if (apiRouter) {
    yield* until(apiRouter(server, dbConn));
  }

  server.get("/health", {
    schema: {
      tags: ["status"],
      response: {
        200: Type.Object({
          status: Type.String(),
        }),
      },
    },
  }, () => {
    return {
      status: "ok",
    };
  });

  server.get("/addresses", {
    schema: {
      tags: ["status"],
      querystring: PaginationQuerySchema,
      response: {
        200: createPaginatedResponseSchema(Type.Object({
          account_id: Type.Union([Type.Number(), Type.Null()]),
          address: Type.String(),
          primary_address: Type.Union([Type.String(), Type.Null()]),
        })),
      },
    },
  }, async (request) => {
    const { limit, skip, count } = getPaginationParams(request);

    const query = request.query as any;
    const paginationParams =
      (query.limit !== undefined || query.skip !== undefined)
        ? { limit, skip }
        : {};

    const addressesPromise = runPreparedQuery(
      getAllAddresses.run(paginationParams as any, dbConn as any),
      "addresses",
    );

    const countPromise = count
      ? runPreparedQuery(
        getAllAddressesCount.run(undefined, dbConn as any),
        "addresses-count",
      )
      : undefined;

    const [addresses, countResult] = await Promise.all([
      addressesPromise,
      countPromise,
    ]);

    const pagination = createPaginationMeta(
      limit,
      skip,
      countResult?.[0]?.total,
      addresses.length,
    );

    return {
      data: addresses,
      pagination,
    };
  });

  // TODO This is dev only endpoint to monitor sync protocols.
  server.get("/debug/sync-protocols", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Array(Type.Object({
          fetcher: Type.Object({}, { additionalProperties: true }),
          pageRelation: Type.Object({}, { additionalProperties: true }),
          bufferedData: Type.Object({}, { additionalProperties: true }),
          newDataCondVar: Type.Object({}, { additionalProperties: true }),
          newPageCondVar: Type.Object({}, { additionalProperties: true }),
          lastPage: Type.Object({}, { additionalProperties: true }),
          config: Type.Object({}, { additionalProperties: true }),
        }, { additionalProperties: true })),
      },
    },
  }, () => {
    const cleanedProtocols = clearBigInts(syncProtocols);
    return cleanedProtocols;
  });

  // TODO This is dev only endpoint to monitor sync protocols.
  server.get("/config", {
    schema: {
      tags: ["status"],
      response: {
        200: Type.Array(Type.Object({
          networkType: Type.String(),
          syncProtocolType: Type.String(),
          syncProtocol: Type.Object({}, { additionalProperties: true }),
          network: Type.Object({}, { additionalProperties: true }),
          primitives: Type.Array(
            Type.Object({}, { additionalProperties: true }),
          ),
        }, { additionalProperties: true })),
      },
    },
  }, () => {
    const config = syncProtocols.map((syncProtocol) => syncProtocol.config)
      .flat();
    const cleanedConfig = clearBigInts(config);
    return cleanedConfig;
  });

  server.get("/grammar", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({}, { additionalProperties: true }),
      },
    },
  }, () => {
    return grammar;
  });

  server.get("/scheduled-data", {
    schema: {
      tags: ["status"],
      querystring: PaginationQuerySchema,
      response: {
        200: createPaginatedResponseSchema(Type.Object({
          caip2: Type.Union([Type.String(), Type.Null()]),
          contract_address: Type.Union([Type.String(), Type.Null()]),
          from_address: Type.Union([Type.String(), Type.Null()]),
          future_block_height: Type.Union([Type.Number(), Type.Null()]),
          future_ms_timestamp: Type.Union([Type.String(), Type.Null()]), // Date as string
          id: Type.Union([Type.Number(), Type.Null()]),
          input_data: Type.Union([Type.String(), Type.Null()]),
          origin_tx_hash: Type.Union([Type.String(), Type.Null()]), // Buffer as string
          primitive_name: Type.Union([Type.String(), Type.Null()]),
        })),
      },
    },
  }, async (request) => {
    const { limit, skip, count } = getPaginationParams(request);

    const query = request.query as any;
    const paginationParams =
      (query.limit !== undefined || query.skip !== undefined)
        ? { limit, skip }
        : {};

    const scheduledDataPromise = runPreparedQuery(
      getAllScheduledData.run(paginationParams as any, dbConn as any),
      "scheduled-data",
    );

    const countPromise = count
      ? runPreparedQuery(
        getAllScheduledDataCount.run(undefined, dbConn as any),
        "scheduled-data-count",
      )
      : undefined;

    const [scheduledData, countResult] = await Promise.all([
      scheduledDataPromise,
      countPromise,
    ]);

    const pagination = createPaginationMeta(
      limit,
      skip,
      countResult?.[0]?.total,
      scheduledData.length,
    );

    return {
      data: scheduledData,
      pagination,
    };
  });

  // TODO How to only select user defined tables?
  server.get("/table-schema/:tableName", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Array(Type.Object({
          column_name: Type.String(),
          data_type: Type.String(),
          character_maximum_length: Type.Number({ nullable: true }),
          column_default: Type.String(),
          is_nullable: Type.String(),
        })),
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { tableName: string } }>,
    _,
  ) => {
    const { tableName } = request.params;

    const result = await runPreparedQuery(
      getTableSchema.run({ tableName: tableName.toLowerCase() }, dbConn as any),
      "table-schema",
    );

    return result;
  });

  // TODO This is a temporary function to allow unsafe SQL queries.
  async function unsafeGetTableData(
    tableName: string,
    limit?: number,
    skip?: number,
  ): Promise<unknown[]> {
    let unsafeQuery = `SELECT * FROM ":1"`;
    const unsafeTableName = tableName.toLowerCase().replace(
      /[^a-zA-Z0-9_]/g,
      "",
    );
    if (unsafeTableName.length > 63) {
      throw new Error("Table name too long");
    }
    unsafeQuery = unsafeQuery.replace(":1", unsafeTableName);

    if (limit !== undefined && skip !== undefined) {
      unsafeQuery += ` LIMIT ${limit} OFFSET ${skip}`;
    }

    const result = await runPreparedQuery<{ rows: unknown[] }>(
      dbConn.query(unsafeQuery),
      "unsafe-get-table-data",
    );
    return result.rows;
  }

  async function unsafeGetTableDataCount(tableName: string): Promise<number> {
    let unsafeQuery = `SELECT COUNT(*) as total FROM ":1"`;
    const unsafeTableName = tableName.toLowerCase().replace(
      /[^a-zA-Z0-9_]/g,
      "",
    );
    if (unsafeTableName.length > 63) {
      throw new Error("Table name too long");
    }
    unsafeQuery = unsafeQuery.replace(":1", unsafeTableName);
    const result = await runPreparedQuery<{ rows: { total: number }[] }>(
      dbConn.query(unsafeQuery),
      "unsafe-get-table-data-count",
    );
    return result.rows[0]?.total || 0;
  }

  server.get(
    "/tables/:tableName",
    {
      schema: {
        tags: ["developer"],
        querystring: PaginationQuerySchema,
        response: {
          200: createPaginatedResponseSchema(
            Type.Object({}, { additionalProperties: true }),
          ),
        },
      },
    },
    async (
      request: FastifyRequest<
        { Params: { tableName: string }; Querystring: any }
      >,
      reply,
    ) => {
      const { tableName } = request.params;
      const { limit, skip, count } = getPaginationParams(request);

      try {
        // Only run count query if explicitly requested
        const dataPromise = unsafeGetTableData(tableName, limit, skip);
        const countPromise = count
          ? unsafeGetTableDataCount(tableName)
          : undefined;

        const [data, total] = await Promise.all([
          dataPromise,
          countPromise,
        ]);

        const pagination = createPaginationMeta(
          limit,
          skip,
          total,
          data.length,
        );

        return {
          data,
          pagination,
        };
      } catch (error) {
        return reply.status(404).send({ error: "Table not found" });
      }
    },
  );

  function getPrimitivePrefixWrapper(
    primitiveName: string,
  ): string | undefined {
    // TODO map/find the results generated bad TS Types (too hard to represent)
    const findPrimitive = (syncProtocols: AllSyncProtocols[]) => {
      for (const syncProtocol of syncProtocols) {
        for (const primitive of syncProtocol.config.primitives) {
          if (primitive.primitive.name === primitiveName) {
            return primitive;
          }
        }
      }
      return undefined;
    };
    const primitive = findPrimitive(syncProtocols);
    if (!primitive) {
      return undefined;
    }
    return getPrimitivePrefix(primitive.primitive.type);
  }

  server.get("/primitives-schema/:primitiveName", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Array(Type.Object({
          column_name: Type.String(),
          data_type: Type.String(),
          character_maximum_length: Type.Number({ nullable: true }),
          column_default: Type.String(),
          is_nullable: Type.String(),
        })),
      },
    },
  }, async (
    request: FastifyRequest<{ Params: { primitiveName: string } }>,
    reply,
  ) => {
    const { primitiveName } = request.params;
    const prefix = getPrimitivePrefixWrapper(primitiveName);
    if (!prefix) {
      return reply.status(404).send({
        error: "Primitive does not have aggregated data",
      });
    }
    const result = await runPreparedQuery(
      getTableSchema.run({
        tableName: `${prefix}${primitiveName.toLowerCase()}`,
      }, dbConn as any),
      "primitives-schema",
    );
    return result;
  });

  server.get(
    "/primitives/:primitiveName",
    {
      schema: {
        tags: ["developer"],
        querystring: PaginationQuerySchema,
        response: {
          // TODO
          200: createPaginatedResponseSchema(
            Type.Object({}, { additionalProperties: true }),
          ),
        },
      },
    },
    async (
      request: FastifyRequest<
        { Params: { primitiveName: string }; Querystring: any }
      >,
      reply,
    ) => {
      const { primitiveName } = request.params;
      const { limit, skip, count } = getPaginationParams(request);
      const prefix = getPrimitivePrefixWrapper(primitiveName);
      if (!prefix) {
        return reply.status(404).send({
          error: "Primitive does not have aggregated data",
        });
      }

      const tableName = `${prefix}${primitiveName.toLowerCase()}`;
      try {
        // Only run count query if explicitly requested
        const dataPromise = unsafeGetTableData(tableName, limit, skip);
        const countPromise = count
          ? unsafeGetTableDataCount(tableName)
          : undefined;

        const [data, total] = await Promise.all([
          dataPromise,
          countPromise,
        ]);

        const pagination = createPaginationMeta(
          limit,
          skip,
          total,
          data.length,
        );

        return {
          data,
          pagination,
        };
      } catch (error) {
        return reply.status(404).send({
          error: "Primitive does not have aggregated data",
        });
      }
    },
  );

  // These endpoints:
  // * /db_aquire_lock
  // * /db_release_lock
  // Are only used by the e2e tests to ensure that only one query is executed at a time.
  // They are not used by the main application.
  // TODO Disable this totally for production.
  server.get("/db_aquire_lock", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.String(),
      },
    },
  }, async () => {
    await run(() => aquireDBMutex("http-server"));
    return "ok";
  });

  server.get("/db_release_lock", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.String(),
      },
    },
  }, () => {
    releaseDBMutex();
    return "ok";
  });

  const rpcEngine = evmRpcEngine(dbConn);
  server.post(`/${RpcPaths.Root}/${RpcPaths.EVM}`, {
    schema: {
      tags: ["user"],
      body: Type.Object({
        // TODO When this is activated some test stop passing.
        // Usign viem public client. e.g., rpcClient.getBlockNumber();
        //   jsonrpc: Type.Literal("2.0"),
        //   method: Type.String(),
        //   params: Type.Array(Type.Any()),
        //   id: Type.Number(),
      }, { additionalProperties: true }),
      externalDocs: {
        url:
          "https://github.com/etclabscore/ethereum-json-rpc-specification/blob/master/openrpc.json",
        description:
          "Partial Implementation of Ethereum JSON-RPC Specification",
      },
      response: {
        200: Type.Object({
          jsonrpc: Type.Literal("2.0"),
          id: Type.Number(),
          result: Type.Any(),
        }),
      },
    },
  }, (request, _) => {
    return rpcEngine.handle(
      request.body as any,
      (err: unknown, result: unknown) => {
        if (err) throw err;
        return result;
      },
    );
  });

  // Start the server
  server.listen(
    { port: ENV.PAIMA_API_PORT, host: "0.0.0.0" },
    (err: Error | null, address: string) => {
      if (err) {
        console.error("err", err);
      }
      console.log(`Paima Engine HTTP server running on ${address}`);
    },
  );
};

export function clearBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      value,
      (_, v) => typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
