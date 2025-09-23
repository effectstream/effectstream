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
  getPrimitivePrefix,
  getSyncAndLastPage,
  getTableSchema,
  type IGetAllAddressesResult,
  type IGetAllTableNamesResult,
  releaseDBMutex,
  runPreparedQuery,
  waitUntilFree,
} from "@paima/db";
import { ENV } from "@paima/utils/node-env";
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
  fetchPrimitiveTablePage,
  fetchPublicTablePage,
  getPaginationParams,
  PaginationQuerySchema,
  type TypePaginationQuerySchema,
} from "./pagination.ts";
import { PaimaPrimitiveRegistry } from "@paima/sm";

function tableListContains(
  list: Array<{ table_name: string | null }>,
  name: string,
): boolean {
  return list.some((t) => t.table_name === name);
}

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

  // Register error-catching handler
  server.setErrorHandler((error, request, reply) => {
    console.error("[HTTP SERVER] Error: ", error, request.url);
    reply.status(500).send({ ok: false, error: error.message });
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
      const validPage = typeof page === "number" && !Number.isNaN(page);
      // Resolve range
      const from = validPage ? page : (fromQuery ?? 0);
      const to = validPage ? page : (toQuery ?? from);
      if (!validPage && (typeof from !== "number" || typeof to !== "number")) {
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
    let addresses: IGetAllAddressesResult[] = [];
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
        const { data, pagination } = await fetchPublicTablePage(
          dbConn,
          safeTableName,
          { limit, after, offset },
        );
        return { data, pagination };
      } catch (error: any) {
        console.error(`Error fetching table ${tableName}:`, error);
        return reply.status(500).send({
          error: error.message || "Internal server error",
        });
      }
    },
  );

  function getPrimitivePrefixWrapper(
    primitiveName: string,
  ): string | undefined {
    const primitiveTry = PaimaPrimitiveRegistry.getPrimitive(primitiveName);
    console.error("primitiveTry", primitiveName, primitiveTry);
    // if (!primitive) {
    //   return undefined;
    // }
    // return primitive.getViewPrefix()[0];

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
    return getPrimitivePrefix((primitive.primitive as any).type)[0];
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
      const { limit, after, offset } = getPaginationParams(request.query);
      const prefix = getPrimitivePrefixWrapper(primitiveName);
      if (!prefix) {
        return reply.status(404).send({
          error: "Primitive does not have aggregated data",
        });
      }

      try {
        const safeTableName = prefix + primitiveName.toLowerCase().replace(
          /[^a-z0-9_]/g,
          "",
        );
        if (safeTableName.length > 128 || safeTableName.length === 0) {
          return reply.status(400).send({ error: "Invalid table name" });
        }
        const { data, pagination } = await fetchPrimitiveTablePage(
          dbConn,
          safeTableName,
          { limit, after, offset },
        );
        return { data, pagination };
      } catch (error: any) {
        console.error(`Error fetching primitive ${primitiveName}:`, error);
        return reply.status(500).send({
          error:
            `Internal server error fetching primitive data: ${error.message}`,
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
