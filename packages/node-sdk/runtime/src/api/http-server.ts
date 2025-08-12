import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { run, until } from "effection";
import {
  acquireDBMutex,
  getAllAddresses,
  getAllScheduledData,
  getPrimitivePrefix,
  getTableSchema,
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
import {
  createIsUserDefinedTableFilter,
  sanitizeIdentifier,
} from "./table-filter.ts";
import type { StartConfigApiRouter } from "../types.ts";
import type { GrammarDefinition } from "@paima/concise";

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

  // Filter that allows only user-defined tables (not system, not dynamic IVM)
  const isUserDefinedTable = createIsUserDefinedTableFilter(syncProtocols);

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

  server.get("/addresses", async () => {
    const result = await runPreparedQuery(
      getAllAddresses.run(undefined, dbConn),
      "addresses",
    );
    return result;
  });

  // TODO This is dev only endpoint to monitor sync protocols.
  server.get("/debug/sync-protocols", {
    schema: {
      tags: ["developer"],
      response: {
        // Simplified representation of the sync protocol.
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
    return clearBigInts(syncProtocols);
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
    return clearBigInts(config);
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

  server.get("/scheduled-data", async () => {
    const result = await runPreparedQuery(
      getAllScheduledData.run(undefined, dbConn),
      "scheduled-data",
    );
    return result;
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
    const safeName = sanitizeIdentifier(tableName);
    if (!isUserDefinedTable(safeName)) {
      return [];
    }
    const result = await runPreparedQuery(
      getTableSchema.run({ tableName: safeName }, dbConn),
      `table-schema:${tableName}`,
    );
    return result;
  });

  // TODO This is a temporary function to allow unsafe SQL queries.
  async function unsafeGetTableData(tableName: string): Promise<unknown[]> {
    let unsafeQuery = `SELECT * FROM ":1"`;
    const unsafeTableName = sanitizeIdentifier(tableName);
    if (!isUserDefinedTable(unsafeTableName)) {
      throw new Error("Table access denied");
    }
    if (unsafeTableName.length > 63) {
      throw new Error("Table name too long");
    }
    unsafeQuery = unsafeQuery.replace(":1", unsafeTableName);
    const result = await runPreparedQuery(
      new Promise<unknown[]>((resolve) => {
        dbConn.query(unsafeQuery, (err: Error, res: { rows: unknown[] }) => {
          if (err) {
            resolve([]);
          } else {
            resolve(res.rows);
          }
        });
      }),
      `unsafe-get-table-data:${unsafeTableName}`,
    );
    return result;
  }

  server.get(
    "/tables/:tableName",
    {
      schema: {
        tags: ["developer"],
        response: {
          200: Type.Array(Type.Object({}, { additionalProperties: true })),
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { tableName: string } }>,
      reply,
    ) => {
      const { tableName } = request.params;
      try {
        const safeName = sanitizeIdentifier(tableName);
        if (!isUserDefinedTable(safeName)) {
          return reply.status(404).send({ error: "Table not found" });
        }
        return await unsafeGetTableData(tableName);
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
        response: {
          // TODO
          200: Type.Array(Type.Object({}, { additionalProperties: true })),
        },
      },
    },
    async (
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
      return await unsafeGetTableData(
        `${prefix}${primitiveName.toLowerCase()}`,
      );
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
  }, async (
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
