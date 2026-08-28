import fastify, {
  type FastifyInstance,
  type FastifyListenOptions,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { evmRpcEngine } from "./rpc-evm/eip1193.ts";
import { appliedBlockStatus } from "./apply-status.ts";
import { finalizedStreamStatus } from "./stream-status.ts";
import { buildHealthReport, healthHttpStatus } from "./health.ts";
import type { Pool } from "pg";
import cors from "@fastify/cors";
import { ensure, type Operation, run, suspend, until } from "effection";
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
  poolErrors,
  releaseDBMutex,
  runPreparedQuery,
  waitUntilFree,
} from "@effectstream/db";
import { ENV } from "@effectstream/utils/node-env";
import type {
  AllSyncProtocols,
  AvailFetcher,
  BitcoinFetcher,
  EvmFetcher,
  MidnightFetcher,
  NtpFetcher,
  TestFetcher,
  UtxoRpcFetcher,
} from "@effectstream/sync";
import fastifySwagger, {
  type FastifyDynamicSwaggerOptions,
} from "@fastify/swagger";
import fastifySwaggerUi, {
  type FastifySwaggerUiOptions,
} from "@fastify/swagger-ui";
import { Type } from "@sinclair/typebox";
import type { StartConfigApiRouter } from "../types.ts";
import type { GrammarDefinition } from "@effectstream/concise";
import {
  createPaginatedResponseSchema,
  createPaginationMeta,
  fetchPrimitiveTablePage,
  fetchPublicTablePage,
  getPaginationParams,
  PaginationQuerySchema,
  type TypePaginationQuerySchema,
} from "./pagination.ts";
import { PrimitiveRegistry } from "@effectstream/sm";
import { ConfigNetworkType, getWriteNamespace, usePaimaStaticConfig } from "@effectstream/config";

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

type ListenOutcome =
  | { ok: true; address: string }
  | { ok: false; error: unknown };

type OwnedFastifyServer = Pick<FastifyInstance, "listen" | "close">;

type OwnedFastifyListen = (
  options: FastifyListenOptions,
) => Operation<string>;

/**
 * Establish cleanup ownership before any work is allowed to use a Fastify
 * instance. The supplied listen operation also keeps an in-flight bind inside
 * that ownership scope, so cancellation cannot close first and then late-bind.
 */
export function* withFastifyCleanup<T>(
  server: OwnedFastifyServer,
  operation: (listen: OwnedFastifyListen) => Operation<T>,
): Operation<T> {
  let listenOutcome: Promise<ListenOutcome> | undefined;
  let listenConsumed = false;
  let primaryFailure: unknown;
  let primaryFailed = false;

  const listen: OwnedFastifyListen = function* (options) {
    if (listenOutcome) throw new Error("Fastify listen was attempted more than once");
    listenOutcome = server.listen(options).then(
      (address) => ({ ok: true as const, address }),
      (error) => ({ ok: false as const, error }),
    );
    const outcome = yield* until(listenOutcome);
    listenConsumed = true;
    if ("error" in outcome) throw outcome.error;
    return outcome.address;
  };

  yield* ensure(function* () {
    let lateListenFailure: unknown;
    let lateListenFailed = false;
    if (listenOutcome) {
      const outcome = yield* until(listenOutcome);
      if ("error" in outcome && !listenConsumed && !primaryFailed) {
        lateListenFailed = true;
        lateListenFailure = outcome.error;
      }
    }

    let closeFailure: unknown;
    let closeFailed = false;
    try {
      // Fastify requires close even before listen and after a rejected listen:
      // plugin onClose hooks and encapsulated resources still belong to it.
      yield* until(server.close());
    } catch (error) {
      closeFailed = true;
      closeFailure = error;
    }

    const effectivePrimaryFailed = primaryFailed || lateListenFailed;
    const effectivePrimary = primaryFailed ? primaryFailure : lateListenFailure;
    if (effectivePrimaryFailed && closeFailed) {
      throw new AggregateError(
        [effectivePrimary, closeFailure],
        "HTTP server operation and close both failed",
      );
    }
    if (lateListenFailed) throw lateListenFailure;
    if (closeFailed) throw closeFailure;
  });

  try {
    return yield* operation(listen);
  } catch (error) {
    primaryFailed = true;
    primaryFailure = error;
    throw error;
  }
}

/**
 * Own a Fastify listen attempt and its partial-start cleanup in one Effection
 * scope. Kept internal to the runtime package; startHttpServer is the public
 * runtime operation.
 */
export function* listenFastifyWithCleanup(
  server: OwnedFastifyServer,
  options: FastifyListenOptions,
) {
  return yield* withFastifyCleanup(server, function* (listen) {
    return yield* listen(options);
  });
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

function* configureHttpServer(
  server: FastifyInstance,
  listen: OwnedFastifyListen,
  dbConn: Pool,
  syncProtocols: AllSyncProtocols[],
  /** How long without applying a block counts as stalled on `/health`. */
  stallThresholdMs: number,
  apiRouter?: StartConfigApiRouter,
  grammar?: GrammarDefinition,
): Operation<void> {
  // Use dbConn directly; queries are executed via pgtyped PreparedQuery.run
  // Allow any webpage to access the server.
  // This node is not specific for a specific website.
  // OpenAPI Docs
  yield* registerOpenApiDocumentation(server, ENV.EFFECTSTREAM_API_PORT);

  // Register error-catching handler
  server.setErrorHandler((error: any, request, reply) => {
    console.error("[HTTP SERVER] Error: ", error, request.url);
    reply.status(500).send({ ok: false, error: error?.message ?? "Unknown error" });
  });

  yield* until(
    server.register(cors, {
      origin: "*",
    }),
  );

  // Explorer API key preHandler for protecting data exploration endpoints
  const explorerApiKeyPreHandler = async <
    T extends FastifyRequest,
    Q extends FastifyReply,
  >(request: T, reply: Q) => {
    const apiKey =
      (request.headers["x-api-key"] as string) ||
      (request.query as Record<string, string>)?.apiKey;

    if (apiKey !== ENV.API_KEY_OPEN_ENDPOINTS_EXPLORER) {
      return reply.status(401).send({
        error: "Unauthorized. Provide a valid API key via x-api-key header or apiKey query parameter.",
      });
    }
  };

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
        const fetcher = protocol.fetcher;
        const networkType = protocol.config.networkType;

        switch (networkType) {
          case ConfigNetworkType.EVM: {
            const evmFetcher = fetcher as EvmFetcher;
            for (let n = from; n <= to; n++) {
              // viem: includeTransactions option is { includeTransactions?: boolean }
              const block = await evmFetcher.client.getBlock({
                blockNumber: BigInt(n),
                includeTransactions,
              });
              blocks.push(block);
            }
            break;
          }
          case ConfigNetworkType.MIDNIGHT: {
            const midnightFetcher = fetcher as MidnightFetcher;
            for (let n = from; n <= to; n++) {
              const result = await midnightFetcher.client.fetchBlock(n);
              if (result?.block) blocks.push(result.block);
            }
            break;
          }
          case ConfigNetworkType.NTP:
            {
              const ntpFetcher = fetcher as NtpFetcher;
              const cfg = ntpFetcher.config.network;
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
            }
            break;
          case ConfigNetworkType.TEST:
            {
              const testFetcher = fetcher as TestFetcher;
              const cfg = testFetcher.config.network;
              if (!cfg?.startTime || !cfg?.blockTimeMS) {
                return reply.status(500).send({ error: "TEST config missing" });
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
            }
            break;
          case ConfigNetworkType.CARDANO: {
            const cardanoFetcher = fetcher as UtxoRpcFetcher;
            const res = cardanoFetcher.client.fetchBlocks(from, to);
            for (const item of res) {
              blocks.push(item.output);
            }
            break;
          }
          case ConfigNetworkType.AVAIL: {
            const availFetcher = fetcher as AvailFetcher;
            for (let n = from; n <= to; n++) {
              const result = await availFetcher.client.getBlockHeaderFromHeight(
                n,
              );
              if (result) blocks.push(result);
            }
            break;
          }
          case ConfigNetworkType.BITCOIN: {
            const bitcoinFetcher = fetcher as BitcoinFetcher;
            for (let n = from; n <= to; n++) {
              const block = await bitcoinFetcher.rpcClient.getBlockByHeight(n);
              blocks.push(block);
            }
            break;
          }
          default:
            return reply.status(400).send(
              `Unsupported network type: ${networkType}`,
            );
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

  const HealthDbSchema = Type.Object({
    consecutive: Type.Number(),
    firstFailureAt: Type.Number(),
    sustainedDurationMs: Type.Number(),
    sustained: Type.Boolean(),
  });
  const HealthProtocolSchema = Type.Object({
    name: Type.String(),
    status: Type.String(),
    ownBlockNumber: Type.Union([Type.Number(), Type.Null()]),
    sinceLastPollMs: Type.Union([Type.Number(), Type.Null()]),
    sinceLastSuccessfulFetchMs: Type.Union([Type.Number(), Type.Null()]),
    consecutiveErrors: Type.Number(),
    producerRestarts: Type.Number(),
    producerErrors: Type.Number(),
    sinceLastProducerErrorMs: Type.Union([Type.Number(), Type.Null()]),
    blockingMerge: Type.Boolean(),
    buffered: Type.Number(),
    bufferCap: Type.Number(),
    paused: Type.Boolean(),
  });
  const HealthResponseSchema = Type.Object({
    status: Type.String(),
    db: HealthDbSchema,
    apply: Type.Object({
      blockHeight: Type.Union([Type.Number(), Type.Null()]),
      sinceLastAppliedMs: Type.Number(),
      lagMs: Type.Union([Type.Number(), Type.Null()]),
    }),
    finalizedStream: Type.Object({
      produced: Type.Number(),
      consumed: Type.Number(),
      inFlight: Type.Number(),
    }),
    protocols: Type.Array(HealthProtocolSchema),
  });
  server.get("/health", {
    schema: {
      tags: ["status"],
      response: {
        200: HealthResponseSchema,
        503: HealthResponseSchema,
      },
    },
  }, (_req, reply) => {
    // Reports sync liveness, not just database reachability — a stalled merge
    // leaves the database perfectly healthy. See ./health.ts.
    const report = buildHealthReport(syncProtocols, stallThresholdMs);
    return reply.status(healthHttpStatus(report.status)).send(report);
  });

  server.get("/addresses", {
    preHandler: explorerApiKeyPreHandler<
      FastifyRequest<{ Querystring: TypePaginationQuerySchema }>,
      FastifyReply
    >,
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

  if (ENV.ENABLE_DEV_AND_DEBUG_ENDPOINTS) {
    server.get("/debug/metrics", {
      schema: {
        tags: ["developer"],
        response: {
          200: Type.Object({}, { additionalProperties: true }),
        },
      },
    }, () => {
      const appliedTs = appliedBlockStatus.timestamp;
      return {
        timestamp: Date.now(),
        uptimeSeconds: process.uptime(),
        memory: process.memoryUsage(),
        protocols: syncProtocols.map((p) => ({
          name: p.name,
          buf: p.bufferedData.size(),
          ownBlockNumber: p.lastPage?.ownBlockNumber ?? null,
          // Backpressure observability
          cap: p.bufferCap,
          bufHighWater: p.bufferHighWater,
          pausedNow: p.pausedNow,
          pauses: p.backpressurePauses,
          pausedMs: p.backpressurePausedMs,
          // Merge-demand exemption: when true the merge is gated on this chain's
          // page and the cap is lifted.
          mergeWaiting: p.mergeWaitingForPage,
          mergeDemandRoot: p.mergeDemandRoot ?? null,
        })),
        // Finalized-block stream backlog: blocks the merge has produced but the
        // apply loop hasn't drained. `inFlight` is the otherwise-unobservable
        // subscriber-queue depth, bounded by backpressure (sync/CLAUDE.md Finding #1).
        // `coalesced` = empty blocks folded away during catch-up.
        finalizedStream: {
          inFlight: finalizedStreamStatus.produced - finalizedStreamStatus.consumed,
          coalesced: finalizedStreamStatus.coalesced,
        },
        // Apply-stage lag: how old the last-applied block is. Unlike `buf` (fetch
        // backlog) this stays high when the node is write/apply-bound.
        applied: {
          blockNumber: appliedBlockStatus.blockNumber,
          timestamp: appliedTs,
          lagSeconds: appliedTs != null
            ? Math.round((Date.now() - appliedTs) / 100) / 10
            : null,
        },
      };
    });

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

    const staticConfigForRoute = yield* usePaimaStaticConfig();
    const securityNamespaceForRoute = getWriteNamespace(
      staticConfigForRoute.securityNamespace,
    );

    server.get("/config", {
      schema: {
        tags: ["developer"],
        response: {
          200: Type.Object({
            securityNamespace: Type.Union([Type.String(), Type.Null()]),
            syncProtocols: Type.Array(Type.Object({
              networkType: Type.String(),
              syncProtocolType: Type.String(),
              syncProtocol: Type.Object({}, { additionalProperties: true }),
              network: Type.Object({}, { additionalProperties: true }),
              primitives: Type.Array(
                Type.Object({}, { additionalProperties: true }),
              ),
            }, { additionalProperties: true })),
          }),
        },
      },
    }, () => {
      const config = syncProtocols.map((syncProtocol) => syncProtocol.config)
        .flat();
      return {
        securityNamespace: securityNamespaceForRoute,
        syncProtocols: clearBigInts(config),
      };
    });
  }

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
    preHandler: explorerApiKeyPreHandler<
      FastifyRequest<{ Querystring: TypePaginationQuerySchema }>,
      FastifyReply
    >,
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
    preHandler: explorerApiKeyPreHandler<
      FastifyRequest<{ Querystring: TypePaginationQuerySchema }>,
      FastifyReply
    >,
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Array(Type.Object({
          table_name: Type.String(),
        })),
      },
    },
  }, async (
    request: FastifyRequest<{ Querystring: TypePaginationQuerySchema }>,
    reply: FastifyReply,
  ) => {
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
    preHandler: explorerApiKeyPreHandler<
      FastifyRequest<{ Params: { tableName: string } }>,
      FastifyReply
    >,
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
      preHandler: explorerApiKeyPreHandler<
        FastifyRequest<{ Querystring: TypePaginationQuerySchema }>,
        FastifyReply
      >,
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
    const primitiveTry = PrimitiveRegistry.getPrimitive(primitiveName);
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
    preHandler: explorerApiKeyPreHandler<
      FastifyRequest<{ Params: { primitiveName: string } }>,
      FastifyReply
    >,
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
      preHandler: explorerApiKeyPreHandler,
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
  // These endpoints are only used by the e2e tests to ensure that only one query is executed at a time.
  if (ENV.ENABLE_DEV_AND_DEBUG_ENDPOINTS) {
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
  }

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

  const address = yield* listen({
    port: ENV.EFFECTSTREAM_API_PORT,
    host: "0.0.0.0",
  });
  console.log(`Paima Engine HTTP server running on ${address}`);
  yield* suspend();
}

/**
 * Start the Paima Engine HTTP server.
 * @param dbConn - The database connection.
 * @param syncProtocols - The sync protocols.
 */
export const startHttpServer = function* (
  dbConn: Pool,
  syncProtocols: AllSyncProtocols[],
  /** How long without applying a block counts as stalled on `/health`. */
  stallThresholdMs: number,
  apiRouter?: StartConfigApiRouter,
  grammar?: GrammarDefinition,
) {
  const server = fastify({ routerOptions: { maxParamLength: 300 } });
  return yield* withFastifyCleanup(server, function* (listen) {
    return yield* configureHttpServer(
      server,
      listen,
      dbConn,
      syncProtocols,
      stallThresholdMs,
      apiRouter,
      grammar,
    );
  });
};

export function clearBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      value,
      (_, v) => typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
