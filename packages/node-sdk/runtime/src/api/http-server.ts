import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import {
  acquireDBMutex,
  getAllAddresses,
  getAllScheduledData,
  getAllTableNames,
  getDynamicTables,
  getPrimaryKeyColumns,
  getPrimitivePrefix,
  getPublicTables,
  getSyncAndLastPage,
  getTableSchema,
  type IGetAllTableNamesResult,
  type IGetDynamicTablesResult,
  type IGetPublicTablesResult,
  releaseDBMutex,
  runPreparedQuery,
  waitUntilFree,
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
  InvalidColumnNameError,
  type PaginatedResponse,
  PaginationQuerySchema,
  type TypePaginationQuerySchema,
  validateAndEscapeColumnName,
  validateColumnName,
} from "./pagination.ts";

// Utility functions for SQL injection prevention moved to pagination.ts

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

  // Register parent error handler
  server.setErrorHandler((error, request, reply) => {
    console.error("[HTTP SERVER] Error: ", error, request.url);
    reply.status(500).send({ ok: false });
  });

  yield* until(
    server.register(cors, {
      origin: "*",
    }),
  );

  // Fetch raw blocks for a given sync protocol and page/range
  server.get(
    "/sync-protocols/:protocolName/blocks",
    {
      schema: {
        tags: ["developer"],
        querystring: Type.Object({
          page: Type.Optional(Type.Number()),
          from: Type.Optional(Type.Number()),
          to: Type.Optional(Type.Number()),
          // EVM-only toggle to include full transactions if supported by the client
          includeTransactions: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Type.Object({
            protocol_name: Type.String(),
            from: Type.Number(),
            to: Type.Number(),
            blocks: Type.Array(Type.Object({}, { additionalProperties: true })),
          }),
        },
      },
    },
    async (
      request: FastifyRequest<
        {
          Params: { protocolName: string };
          Querystring: {
            page?: number;
            from?: number;
            to?: number;
            includeTransactions?: boolean;
          };
        }
      >,
      reply,
    ) => {
      const { protocolName } = request.params;
      const {
        page,
        from: fromQuery,
        to: toQuery,
        includeTransactions = false,
      } = request.query;

      // Resolve range
      const from = typeof page === "number" ? page : (fromQuery ?? 0);
      const to = typeof page === "number" ? page : (toQuery ?? from);
      if (typeof from !== "number" || typeof to !== "number") {
        return reply.status(400).send({ error: "Specify page or from/to" });
      }
      if (to < from) {
        return reply.status(400).send({ error: "Invalid range: to < from" });
      }

      try {
        const protocol = syncProtocols.find((p) => p.name === protocolName);
        if (!protocol) {
          return reply.status(404).send({ error: "Protocol not found" });
        }

        const blocks: any[] = [];
        const fetcher: any = (protocol as any).fetcher;
        // TODO: Utilize cache strategy for getting the blocks

        // EVM (viem PublicClient)
        if (fetcher?.client?.getBlock) {
          for (let n = from; n <= to; n++) {
            // viem: includeTransactions option is { includeTransactions?: boolean }
            const block = await fetcher.client.getBlock({
              blockNumber: BigInt(n),
              includeTransactions,
            });
            blocks.push(block);
          }
          // Midnight
        } else if (fetcher?.client?.fetchBlock) {
          for (let n = from; n <= to; n++) {
            const result = await fetcher.client.fetchBlock(n);
            if (result?.block) blocks.push(result.block);
          }
          // UTXO RPC (buffered)
        } else if (fetcher?.client?.fetchBlocks) {
          const res = fetcher.client.fetchBlocks(from, to);
          for (const item of res) {
            blocks.push(item.output.raw);
          }
          // NTP synthetic blocks
        } else if (fetcher?.ntpTimeSync != null) {
          const cfg = (protocol as any).config?.network;
          if (!cfg?.startTime || !cfg?.blockTimeMS) {
            return reply.status(500).send({ error: "NTP config missing" });
          }
          for (let n = from; n <= to; n++) {
            const timestamp = BigInt(cfg.startTime) +
              BigInt(cfg.blockTimeMS) * BigInt(n);
            blocks.push({
              blockNumber: n,
              timestamp,
              hash: `0x${timestamp.toString(16)}`,
            });
          }
        } else {
          return reply.status(400).send({ error: "Unsupported protocol type" });
        }

        return clearBigInts({
          protocol_name: protocolName,
          from,
          to,
          blocks,
        });
      } catch (error) {
        console.error("Error fetching blocks: ", error);
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
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
      querystring: Type.Object({
        limit: PaginationQuerySchema.properties.limit,
        after: Type.Optional(Type.Union([
          Type.String({
            description:
              "Cursor for next page (base64-encoded JSON object with primary key values)",
            examples: ["eyJhY2NvdW50X2lkIjoxMjMsImFkZHJlc3MiOiIwMXQzIn0="],
          }),
          Type.Number({
            description: "Offset for pagination (0-based)",
            minimum: 0,
            examples: [0, 100, 500],
          }),
        ])),
      }),
      response: {
        200: createPaginatedResponseSchema(Type.Object({
          account_id: Type.Union([Type.Number(), Type.Null()]),
          address: Type.String(),
          primary_address: Type.Union([Type.String(), Type.Null()]),
        })),
      },
    },
  }, async (
    request: FastifyRequest<{
      Querystring: TypePaginationQuerySchema;
    }>,
  ) => {
    const { limit, after } = getPaginationParams<{
      account_id: number;
      address: string;
    }>(request.query);
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

  server.get("/block-heights", {
    schema: {
      tags: ["status"],
      response: {
        200: Type.Array(Type.Object({
          protocol_name: Type.String(),
          synced_page: Type.Number({ nullable: true }),
          fetched_page: Type.Number({ nullable: true }),
        })),
      },
    },
  }, async () => {
    const blockHeights = await runPreparedQuery(
      getSyncAndLastPage.run(undefined, dbConn),
      "block-heights",
    );
    return blockHeights;
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
      querystring: Type.Object({
        limit: PaginationQuerySchema.properties.limit,
        after: Type.Optional(Type.Union([
          Type.String({
            description:
              "Cursor for next page (base64-encoded JSON object with primary key values)",
            examples: ["eyJpZCI6MTIzfQ=="],
          }),
          Type.Number({
            description: "Offset for pagination (0-based)",
            minimum: 0,
            examples: [0, 100, 500],
          }),
        ])),
      }),
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
  }, async (
    request: FastifyRequest<{
      Querystring: TypePaginationQuerySchema;
    }>,
  ) => {
    const { limit, after } = getPaginationParams<{
      id: number;
    }>(request.query);

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

  server.get("/tables", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Array(Type.Object({
          table_name: Type.String(),
        })),
      },
    },
  }, async () => {
    const tables = (await runPreparedQuery(
      getAllTableNames.run(undefined, dbConn),
      "tables",
    )) as IGetAllTableNamesResult[];
    return tables
      .filter((t): t is { tablename: string } => t.tablename !== null)
      .map((t) => ({ table_name: t.tablename }));
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
      getTableSchema.run({ tableName: tableName.toLowerCase() }, dbConn),
      `table-schema:${tableName}`,
    );

    return result;
  });

  server.get(
    "/tables/:tableName",
    {
      schema: {
        tags: ["developer"],
        querystring: Type.Object({
          limit: PaginationQuerySchema.properties.limit,
          after: Type.Optional(Type.Union([
            Type.String({
              description:
                "Cursor for next page (base64-encoded JSON object with primary key values)",
              examples: ["eyJpZCI6MTIzfQ=="],
            }),
            Type.Number({
              description:
                "Offset for pagination when no primary key is available (0-based)",
              minimum: 0,
              examples: [0, 100, 500],
            }),
          ])),
        }),
        response: {
          200: createPaginatedResponseSchema(
            Type.Object({}, { additionalProperties: true }),
          ),
        },
      },
    },
    async (
      request: FastifyRequest<
        {
          Params: { tableName: string };
          Querystring: TypePaginationQuerySchema;
        }
      >,
      reply,
    ) => {
      const { tableName } = request.params;
      const { limit, after, offset } = getPaginationParams(request.query);

      try {
        // Sanitize table name
        const safeTableName = tableName.toLowerCase().replace(
          /[^a-z0-9_.]/g,
          "",
        );
        if (safeTableName.length > 128 || safeTableName.length === 0) {
          return reply.status(400).send({ error: "Invalid table name" });
        }
        const publicTables = await runPreparedQuery<IGetPublicTablesResult>(
          getPublicTables.run(undefined, dbConn),
          "getPublicTables",
        );
        if (
          !publicTables.some((t: IGetPublicTablesResult) =>
            t.table_name === safeTableName
          )
        ) {
          return reply.status(400).send({
            error:
              `Invalid table name, not found in public schema: ${safeTableName}`,
          });
        }
        // 1. Introspect for Primary Keys
        const pkColumnsResult: { column_name: string }[] =
          await runPreparedQuery(
            getPrimaryKeyColumns.run(
              { tableName: `public.${safeTableName}` },
              dbConn,
            ),
            "getPrimaryKeyColumns",
          );
        const pkColumns = pkColumnsResult.map((c: { column_name: string }) =>
          c.column_name
        );

        let query: string;
        const params: (string | number)[] = [];
        let cursorFields: string[] = [];
        let nextCursorSeed: Record<string, string | number> | null = null;

        // 2. Determine Pagination Strategy
        if (pkColumns.length > 0) {
          // --- Keyset Pagination Strategy ---
          cursorFields = pkColumns;

          // Validate that all primary key columns are legitimate column names
          const invalidPkColumns = pkColumns.filter((c) =>
            !validateColumnName(c)
          );
          if (invalidPkColumns.length > 0) {
            return reply.status(500).send({
              error: `Invalid primary key column names detected: ${
                invalidPkColumns.join(", ")
              }`,
            });
          }

          // Validate cursor structure matches primary key columns
          if (after) {
            const cursorKeys = Object.keys(after);
            const missingKeys = pkColumns.filter((pk) =>
              !cursorKeys.includes(pk)
            );
            const extraKeys = cursorKeys.filter((k) => !pkColumns.includes(k));

            if (missingKeys.length > 0 || extraKeys.length > 0) {
              return reply.status(400).send({
                error: `Cursor must contain exactly the primary key columns: ${
                  pkColumns.join(", ")
                }`,
              });
            }
          }

          let whereClause = "";
          const escapedColumns: string[] = [];
          try {
            for (const c of pkColumns) {
              escapedColumns.push(validateAndEscapeColumnName(c));
            }
          } catch (e) {
            if (e instanceof InvalidColumnNameError) {
              return reply.status(500).send({ error: e.message });
            }
            throw e;
          }
          const orderByClause = `ORDER BY ${
            escapedColumns.map((c) => `${c} ASC`).join(", ")
          }`;

          if (after) {
            const pkValues = pkColumns.map((c: string) => (after as any)[c]);
            const placeholders = pkColumns.map((_, i: number) => `$${i + 2}`)
              .join(", ");
            whereClause = `WHERE (${
              escapedColumns.join(", ")
            }) > (${placeholders})`;
            params.push(...pkValues);
          }

          query =
            `SELECT * FROM public.${safeTableName} ${whereClause} ${orderByClause} LIMIT $1`;
          params.unshift(limit + 1);
        } else {
          // --- Offset Pagination Fallback Strategy ---
          console.warn(
            `[Paima Engine] WARNING: Table "${safeTableName}" has no primary key. Falling back to less performant OFFSET-based pagination.`,
          );

          // Use offset from pagination parameters, defaulting to 0
          const paginationOffset = offset ?? 0;

          // Validate offset is non-negative
          if (paginationOffset < 0) {
            return reply.status(400).send({
              error: "Invalid offset: must be non-negative",
            });
          }

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

          // Validate that the order-by column name is safe
          const orderByColumn = tableSchema[0].column_name;
          if (!orderByColumn) {
            return reply.status(500).send({
              error: "Table has no valid column for ordering",
            });
          }

          let escapedOrderByColumn: string;
          try {
            escapedOrderByColumn = validateAndEscapeColumnName(orderByColumn);
          } catch (e) {
            if (e instanceof InvalidColumnNameError) {
              return reply.status(500).send({ error: e.message });
            }
            throw e;
          }

          const orderByClause = `ORDER BY ${escapedOrderByColumn} ASC`;

          query =
            `SELECT * FROM public.${safeTableName} ${orderByClause} LIMIT $1 OFFSET $2`;
          params.push(limit + 1, paginationOffset);
          nextCursorSeed = { offset: paginationOffset + limit };
        }

        // Execute the query safely with prepared parameters
        const data = await runPreparedQuery(
          new Promise<any[]>((resolve, reject) => {
            return dbConn.query(
              query,
              params,
              (err: any, result: { rows: any[] }) => {
                if (err) reject(err);
                resolve(result.rows);
              },
            );
          }),
          `http-server/tables:${safeTableName}/${query}/${params}`,
        );

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
      }, dbConn),
      `primitives-schema:${primitiveName}`,
    );
    return result;
  });

  server.get(
    "/primitives/:primitiveName",
    {
      schema: {
        tags: ["developer"],
        querystring: Type.Object({
          limit: PaginationQuerySchema.properties.limit,
          after: Type.Optional(Type.Union([
            Type.String({
              description:
                "Cursor for next page (base64-encoded JSON object with primary key values)",
              examples: ["eyJpZCI6MTIzfQ=="],
            }),
            Type.Number({
              description:
                "Offset for pagination when no primary key is available (0-based)",
              minimum: 0,
              examples: [0, 100, 500],
            }),
          ])),
        }),
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
        {
          Params: { primitiveName: string };
          Querystring: TypePaginationQuerySchema;
        }
      >,
      reply,
    ) => {
      const { primitiveName } = request.params;
      const { limit, after } = getPaginationParams(request.query);
      const prefix = getPrimitivePrefixWrapper(primitiveName);
      if (!prefix) {
        return reply.status(404).send({
          error: "Primitive does not have aggregated data",
        });
      }

      try {
        // Primitives are system-generated and are guaranteed to have an `id` PK.
        // We can use a simplified, but still safe, query.
        const safeTableName = prefix + primitiveName.toLowerCase().replace(
          /[^a-z0-9_]/g,
          "",
        );

        // Check Table Exists
        const tableExists = await runPreparedQuery<IGetDynamicTablesResult>(
          getDynamicTables.run(undefined, dbConn),
          "getDynamicTables",
        );
        if (
          !tableExists.some((t: IGetDynamicTablesResult) =>
            t.table_name === safeTableName
          )
        ) {
          return reply.status(404).send({
            error: `Table not found: ${safeTableName}`,
          });
        }

        // Validate cursor structure and extract primary key safely
        let primaryKey: string | undefined;
        let afterId: any;

        if (after) {
          const keys = Object.keys(after);
          if (keys.length !== 1) {
            return reply.status(400).send({
              error:
                "Invalid cursor: must contain exactly one primary key field",
            });
          }

          primaryKey = keys[0];
          const escapedKey = validateAndEscapeColumnName(primaryKey);
          if (!escapedKey) {
            return reply.status(400).send({
              error: "Invalid primary key column name in cursor",
            });
          }

          afterId = (after as any)[primaryKey];
          if (typeof afterId !== "number" && typeof afterId !== "string") {
            return reply.status(400).send({
              error: "Invalid primary key value in cursor",
            });
          }
        }

        // Construct safe parameterized query
        let query: string;
        let params: any[];

        if (primaryKey && afterId !== undefined) {
          let escapedKey: string;
          try {
            escapedKey = validateAndEscapeColumnName(primaryKey);
          } catch (e) {
            if (e instanceof InvalidColumnNameError) {
              return reply.status(400).send({ error: e.message });
            }
            throw e;
          }
          query =
            `SELECT * FROM primitives.${safeTableName} WHERE ${escapedKey} > $1 ORDER BY ${escapedKey} ASC LIMIT $2`;
          params = [afterId, limit + 1];
        } else {
          query = `SELECT * FROM primitives.${safeTableName} LIMIT $1`;
          params = [limit + 1];
        }

        const data = await runPreparedQuery(
          new Promise<any[]>((resolve, reject) => {
            return dbConn.query(
              query,
              params,
              (err: any, result: { rows: any[] }) => {
                if (err) reject(err);
                resolve(result.rows);
              },
            );
          }),
          `http-server/primitives:${safeTableName}/${query}/${params}`,
        );

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

  server.get("/db_status", () => {
    return waitUntilFree();
  });
  // These endpoints:
  // * /db_acquire_lock
  // * /db_release_lock
  // Are only used by the e2e tests to ensure that only one query is executed at a time.
  // They are not used by the main application.
  // TODO Disable this totally for production.
  server.get(
    "/db_acquire_lock",
    {
      schema: {
        tags: ["developer"],
        response: {
          200: Type.String(),
        },
        querystring: Type.Object({
          name: Type.String(),
        }),
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { name: string } }>,
      reply,
    ) => {
      const { name } = request.query;
      await run(() => acquireDBMutex(`http-server:${name}`));
      return "ok";
    },
  );

  server.get("/db_release_lock", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.String(),
      },
      querystring: Type.Object({
        name: Type.String(),
      }),
    },
  }, (
    request: FastifyRequest<{ Querystring: { name: string } }>,
    reply,
  ) => {
    const { name } = request.query;
    releaseDBMutex(`http-server:${name}`);
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
