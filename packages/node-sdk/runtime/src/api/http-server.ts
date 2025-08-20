import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import {
  aquireDBMutex,
  getAllAddresses,
  getAllScheduledData,
  getPrimaryKeyColumns,
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
  type PaginatedResponse,
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
    const { limit, after } = getPaginationParams(request);
    let addresses: any[] = [];
    try {
      // @ts-ignore - pgtyped overload resolution is failing in this context
      addresses = await runPreparedQuery(
        getAllAddresses.run(
          {
            limit,
            after_account_id: after?.account_id ?? null,
            after_address: after?.address ?? null,
          },
          dbConn,
        ),
        "addresses",
      );
    } catch (error) {
      console.error("Error fetching addresses:", error);
      throw error;
    }

    const pagination = createPaginationMeta(
      limit,
      addresses,
      ["account_id", "address"],
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
    const { limit, after } = getPaginationParams(request);

    let scheduledData: any[] = [];
    try {
      // @ts-ignore - pgtyped overload resolution is failing in this context
      scheduledData = await runPreparedQuery(
        getAllScheduledData.run(
          {
            limit,
            after_id: after?.id ?? null,
          },
          dbConn,
        ),
        "scheduled-data",
      );
    } catch (error) {
      console.error("Error fetching scheduled data:", error);
      throw error;
    }

    const pagination = createPaginationMeta(
      limit,
      scheduledData,
      ["id"],
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
    afterId?: number | string,
  ): Promise<unknown[]> {
    // Split by dot for schema.table
    const parts = tableName.split(".");
    if (parts.length > 2) {
      throw new Error("Invalid table name format");
    }
    const sanitizedParts = parts.map((part) =>
      part.toLowerCase().replace(/[^a-z0-9_]/g, "")
    );
    const unsafeTableName = sanitizedParts.join(".");

    if (unsafeTableName.length > 128) { // Arbitrary longer limit
      throw new Error("Table name too long");
    }

    let unsafeQuery = `SELECT * FROM ${unsafeTableName}`;

    if (afterId !== undefined) {
      const whereValue = typeof afterId === "string"
        ? `'${afterId.replace(/'/g, "''")}'`
        : afterId;
      unsafeQuery += ` WHERE id > ${whereValue}`;
    }
    unsafeQuery += " ORDER BY id ASC";

    if (limit !== undefined) {
      unsafeQuery += ` LIMIT ${limit}`;
    }

    const result = await dbConn.query(unsafeQuery);
    return result.rows;
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
      const { limit, after } = getPaginationParams(request);

      try {
        // Sanitize table name
        const safeTableName = tableName.toLowerCase().replace(
          /[^a-z0-9_.]/g,
          "",
        );
        if (safeTableName.length > 128 || safeTableName.length === 0) {
          return reply.status(400).send({ error: "Invalid table name" });
        }

        // 1. Introspect for Primary Keys
        const pkColumnsResult: { column_name: string }[] =
          await runPreparedQuery(
            getPrimaryKeyColumns.run({ tableName: safeTableName }, dbConn),
            "getPrimaryKeyColumns",
          );
        const pkColumns = pkColumnsResult.map((c: { column_name: string }) =>
          c.column_name
        );

        let query: string;
        const params: any[] = [];
        let cursorFields: string[] = [];
        let nextCursorSeed: Record<string, any> | null = null;

        // 2. Determine Pagination Strategy
        if (pkColumns.length > 0) {
          // --- Keyset Pagination Strategy ---
          cursorFields = pkColumns;
          let whereClause = "";
          const orderByClause = `ORDER BY ${
            pkColumns.map((c) => `"${c}" ASC`).join(", ")
          }`;

          if (after) {
            const pkValues = pkColumns.map((c: string) => after[c]);
            const placeholders = pkColumns.map((_, i: number) => `$${i + 2}`)
              .join(", ");
            whereClause = `WHERE (${
              pkColumns.map((c: string) => `"${c}"`).join(", ")
            }) > (${placeholders})`;
            params.push(...pkValues);
          }

          query =
            `SELECT * FROM custom.${safeTableName} ${whereClause} ${orderByClause} LIMIT $1`;
          params.unshift(limit + 1);
        } else {
          // --- Offset Pagination Fallback Strategy ---
          console.warn(
            `[Paima Engine] WARNING: Table "${safeTableName}" has no primary key. Falling back to less performant OFFSET-based pagination.`,
          );
          const offset = after?.offset || 0;

          // Find a column to order by
          const tableSchema = await runPreparedQuery(
            getTableSchema.run({ tableName: safeTableName }, dbConn),
            "table-schema",
          );
          if (tableSchema.length === 0) {
            return reply.status(404).send({
              error: "Table has no columns or does not exist",
            });
          }
          const orderByColumn = tableSchema[0].column_name;
          const orderByClause = `ORDER BY "${orderByColumn}" ASC`;

          query =
            `SELECT * FROM custom.${safeTableName} ${orderByClause} LIMIT $1 OFFSET $2`;
          params.push(limit + 1, offset);
          nextCursorSeed = { offset: offset + limit };
        }

        const result = await dbConn.query(query, params);
        const data = result.rows;

        const pagination = createPaginationMeta(
          limit,
          data,
          cursorFields,
          nextCursorSeed,
        );

        return {
          data,
          pagination,
        };
      } catch (error: any) {
        if (error.code === "42P01") { // undefined_table
          return reply.status(404).send({ error: "Table not found" });
        }
        console.error(`Error fetching table ${tableName}:`, error);
        return reply.status(500).send({ error: "Internal server error" });
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
      const { limit, after } = getPaginationParams(request);
      const prefix = getPrimitivePrefixWrapper(primitiveName);
      if (!prefix) {
        return reply.status(404).send({
          error: "Primitive does not have aggregated data",
        });
      }

      try {
        // Primitives are system-generated and are guaranteed to have an `id` PK.
        // We can use a simplified, but still safe, query.
        const safeTableName = primitiveName.toLowerCase().replace(
          /[^a-z0-9_]/g,
          "",
        );
        const afterId = after?.id;

        const query =
          `SELECT * FROM primitives.${safeTableName} WHERE ($1::INT IS NULL OR id > $1::INT) ORDER BY id ASC LIMIT $2`;
        const params: (string | number | null)[] = [afterId, limit + 1];

        const result = await dbConn.query(query, params);
        const data = result.rows;

        const pagination = createPaginationMeta(
          limit,
          data,
          ["id"],
        );

        return {
          data,
          pagination,
        };
      } catch (error: any) {
        if (error.code === "42P01") { // undefined_table
          return reply.status(404).send({
            error: "Primitive table not found",
          });
        }
        console.error(`Error fetching primitive ${primitiveName}:`, error);
        return reply.status(500).send({
          error: "Internal server error fetching primitive data",
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
