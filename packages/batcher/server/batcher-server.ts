import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { type Static, Type } from "@sinclair/typebox";
import type { Batcher, DefaultBatcherInput } from "../core/mod.ts";
import { InputValidationError } from "../core/batcher.ts";
import fastifySwagger, {
  type FastifyDynamicSwaggerOptions,
} from "@fastify/swagger";
import fastifySwaggerUi, {
  type FastifySwaggerUiOptions,
} from "@fastify/swagger-ui";
import {
  type RateLimitBucket,
  type RateLimitCheckResult,
  type RateLimitKeyStrategy,
  RateLimiter,
  InMemoryRateLimitStore,
} from "../core/rate-limiter.ts";
import { DEFAULT_CONFIG_VALUES } from "../core/config.ts";
import { ENV } from "@effectstream/utils/node-env";

// TypeBox schema for DefaultBatcherInput (adapted for new batcher input format)
const BatcherInputSchema = Type.Object({
  address: Type.String(),
  addressType: Type.Number(),
  input: Type.String(),
  signature: Type.Optional(Type.String()),
  timestamp: Type.String(),
  target: Type.Optional(Type.String()),
});

const BatcherInputWrapper = Type.Object({
  data: BatcherInputSchema,
  confirmationLevel: Type.Union([
    Type.Literal("no-wait"),
    Type.Literal("wait-receipt"),
    Type.Literal("wait-effectstream-processed"),
  ], {
    default: "wait-receipt",
  }),
  timeoutMs: Type.Optional(Type.Number({ description: "Receipt confirmation timeout in milliseconds (default: 60000)" })),
});

type BatcherInputWrapper = Static<typeof BatcherInputWrapper>;

class RateLimitExceededError extends Error {
  constructor(public readonly result: RateLimitCheckResult) {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

/**
 * Derive the server-scoped bucket checked before authentication.
 *
 * This intentionally excludes all attacker-controlled request fields. It
 * bounds signature-verification work without allowing a forged address or
 * target to consume another authenticated identity's allowance.
 */
export function buildPreAuthRateLimitBuckets(
  ip: string,
  preAuthMaxRequests: number,
): RateLimitBucket[] {
  return [{
    key: `pre-auth:ip:${encodeURIComponent(ip)}`,
    maxRequests: preAuthMaxRequests,
  }];
}

/**
 * Register the OpenAPI documentation for the batcher server.
 * Create the OpenAPI specification and the UI.
 * UI is attached at /documentation
 * @param server - The Fastify instance.
 * @param port - The port to listen on.
 */
async function registerOpenApiDocumentation(
  server: FastifyInstance,
  port: number,
) {
  // Generate OpenAPI documentation
  // Documentation is available at /documentation /documentation/json /documentation/yaml
  const openApiOptions: FastifyDynamicSwaggerOptions = {
    openapi: {
      info: {
        title: "Batcher",
        description:
          "Batcher API - Simplified architecture with configuration-driven batching",
        version: "2.0.0",
      },
      tags: [
        {
          name: "batcher",
          description: "User Batcher related end-points",
        },
        {
          name: "developer",
          description: "Devops/Status related end-points",
        },
      ],
      servers: [
        {
          url: `http://localhost:${port}`,
          description: "Local server",
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

  await server.register(fastifySwagger as any, openApiOptions);
  await server.register(fastifySwaggerUi as any, uiOptions);

  // Register error-catching handler
  server.setErrorHandler((error, request, reply) => {
    console.error("[HTTP SERVER] Error: ", error, request.url);

    // Handle validation errors (return 400 instead of 500)
    if ((error as any).validation) {
      return reply.status(400).send({
        success: false,
        error: "Validation failed",
        message: "Invalid request data",
        details: (error as any).validation
      });
    }

    // Handle InputValidationError (return appropriate status code)
    if (error instanceof InputValidationError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: "Validation failed",
        message: error.message,
        // Branch on errorCode, not on message: the message may carry detail
        // derived from the submitted input, the code is stable.
        ...(error.errorCode !== undefined ? { errorCode: error.errorCode } : {}),
        ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
      });
    }

    reply.status(500).send({ ok: false, error: (error as any).message ?? "Unknown error" });
  });
}

/**
 * Derive the authenticated rate limit buckets a request draws down.
 *
 * Every strategy includes a validated-target global bucket. Exported for tests:
 * key choice and per-bucket ceilings are otherwise hard to observe without
 * standing up a server and exhausting a limit.
 */
export function buildRateLimitBuckets(
  strategy: RateLimitKeyStrategy,
  target: string,
  ip: string,
  address: string | undefined,
  maxRequests: number,
  globalMaxRequests: number,
): RateLimitBucket[] {
  const scope = encodeURIComponent(target);
  const component = (value: string) => encodeURIComponent(value);
  const globalBucket: RateLimitBucket = {
    key: `target:${scope}:global`,
    maxRequests: globalMaxRequests,
  };

  switch (strategy) {
    case "ip":
      return [
        globalBucket,
        {
          key: `target:${scope}:ip:${component(ip)}`,
          maxRequests,
        },
      ];
    case "ip-and-address": {
      // The venue/shared-IP ceiling is the target-global sponsor maximum. A
      // verified wallet gets the lower identity allowance, so one wallet can
      // exhaust its budget without blocking every other wallet behind the NAT.
      const buckets: RateLimitBucket[] = [
        globalBucket,
        {
          key: `target:${scope}:ip:${component(ip)}`,
          maxRequests: globalMaxRequests,
        },
      ];
      if (address) {
        buckets.push({
          key: `target:${scope}:addr:${component(address)}`,
          maxRequests,
        });
      }
      return buckets;
    }
    case "composite":
      return [
        globalBucket,
        {
          key:
            `target:${scope}:composite:${component(ip)}:${component(address ?? "unknown")}`,
          maxRequests,
        },
      ];
    default:
      return [
        globalBucket,
        {
          key: `target:${scope}:ip:${component(ip)}`,
          maxRequests,
        },
      ];
  }
}

/**
 * Start the batcher HTTP server.
 * @param batcher - Batcher instance.
 * @param port - The port to listen on.
 */
export async function startBatcherHttpServer<T extends DefaultBatcherInput>(
  batcher: Batcher<T>,
  port: number,
): Promise<FastifyInstance> {
  const server = fastify();

  await registerOpenApiDocumentation(server, port);

  await server.register(cors as any, { origin: "*" });

  // Initialize rate limiter (enabled by default with defaults from config)
  const rateLimitConfig = batcher.config.rateLimit ??
    DEFAULT_CONFIG_VALUES.rateLimit;
  const { maxRequests, windowMs } = rateLimitConfig;
  const globalMaxRequests = rateLimitConfig.globalMaxRequests ?? maxRequests;
  const preAuthMaxRequests = rateLimitConfig.preAuthMaxRequests ??
    globalMaxRequests;
  const rateLimitStore = batcher.config.rateLimit?.store ?? new InMemoryRateLimitStore();
  const rateLimiter = new RateLimiter(
    rateLimitStore,
    maxRequests,
    windowMs,
  );

  // Periodic cleanup of expired rate limit entries to prevent unbounded memory growth
  const cleanupInterval = setInterval(() => {
    rateLimitStore.cleanup(Date.now(), windowMs);
  }, Math.min(windowMs, 3600000)); // Clean up at least every hour
  server.addHook("onClose", () => clearInterval(cleanupInterval));

  server.get("/health", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          status: Type.String(),
          isInitialized: Type.Boolean(),
          isRunning: Type.Boolean(),
        }),
      },
    },
  }, () => {
    return {
      status: "ok",
      isInitialized: batcher.isInitialized || false,
      isRunning: true,
    };
  });

  server.get("/status", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          batcher: Type.Object({
            isInitialized: Type.Boolean(),
            totalPendingInputs: Type.Number(),
            targets: Type.Array(Type.Object({
              target: Type.String(),
              pendingInputs: Type.Number(),
              isReady: Type.Boolean(),
              criteriaType: Type.String(),
              timeSinceLastProcess: Type.Number(),
            })),
            adapterTargets: Type.Array(Type.String()),
          }),
          config: Type.Object({
            pollingIntervalMs: Type.Number(),
            defaultTarget: Type.String(),
            enableHttpServer: Type.Boolean(),
            enableEventSystem: Type.Boolean(),
            confirmationLevel: Type.Union([
              Type.String(),
              Type.Record(Type.String(), Type.String()),
            ]),
          }),
          timestamp: Type.String(),
        }),
      },
    },
  }, async () => {
    const status = await batcher.getBatchingStatus();
    const config = batcher.getPublicConfig();
    return {
      batcher: {
        isInitialized: batcher.isInitialized || false,
        totalPendingInputs: status.totalPendingInputs,
        targets: status.targets,
        adapterTargets: status.adapterTargets,
      },
      config,
      timestamp: new Date().toISOString(),
    };
  });

  server.get("/queue-stats", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          totalPendingInputs: Type.Number(),
          targets: Type.Array(Type.Object({
            target: Type.String(),
            pendingInputs: Type.Number(),
            isReady: Type.Boolean(),
            criteriaType: Type.String(),
            timeSinceLastProcess: Type.Number(),
            health: Type.Optional(Type.Any()),
          })),
        }),
      },
    },
  }, async () => {
    const status = await batcher.getBatchingStatus();
    return {
      totalPendingInputs: status.totalPendingInputs,
      // Adapters may expose an operational snapshot (fee capacity, workers,
      // policy shape). In a multi-product batcher this is how you tell WHICH
      // product is degraded without reading logs.
      targets: status.targets.map((t) => {
        const adapter = batcher.getAdapter(t.target) as
          | { getHealthInfo?: () => Record<string, unknown> }
          | undefined;
        let health: Record<string, unknown> | undefined;
        try {
          health = adapter?.getHealthInfo?.();
        } catch {
          health = undefined;
        }
        return health ? { ...t, health } : t;
      }),
    };
  });

  // Add user input to batcher
  server.post("/send-input", {
    schema: {
      tags: ["batcher"],
      body: BatcherInputWrapper,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
          inputsProcessed: Type.Number(),
          transactionHash: Type.Optional(Type.String()),
          rollup: Type.Optional(Type.Number()),
        }),
        // A rejected input. `errorCode` is the stable discriminator; `retryable`
        // says whether the identical input could succeed later.
        400: Type.Object({
          success: Type.Boolean(),
          error: Type.String(),
          message: Type.String(),
          errorCode: Type.Optional(Type.String()),
          retryable: Type.Optional(Type.Boolean()),
        }),
        429: Type.Object({
          success: Type.Boolean(),
          error: Type.String(),
          message: Type.String(),
          retryAfter: Type.Optional(Type.Number()),
        }),
        // Validation could not be COMPLETED — a dependency of the check was
        // unavailable. Distinct from 400: the input was never judged, so the
        // caller should retry rather than change it.
        503: Type.Object({
          success: Type.Boolean(),
          error: Type.String(),
          message: Type.String(),
          errorCode: Type.Optional(Type.String()),
          retryable: Type.Optional(Type.Boolean()),
        }),
      },
    },
  }, async (
    request: FastifyRequest,
    reply,
  ) => {
    try {
      const preAuthRateLimitResult = await rateLimiter.checkBuckets(
        buildPreAuthRateLimitBuckets(request.ip, preAuthMaxRequests),
      );
      if (!preAuthRateLimitResult.allowed) {
        throw new RateLimitExceededError(preAuthRateLimitResult);
      }

      const body = request.body as any;

      const batcherInput = body.data;
      let confirmationLevel = body.confirmationLevel as any;
      if (!confirmationLevel) {
        const cfg = batcher.config?.confirmationLevel;
        if (typeof cfg === "string") {
          confirmationLevel = cfg;
        } else if (cfg && typeof batcher === "object") {
          const target = (body.data?.target as string) ||
            (batcher.getPublicConfig().defaultTarget) || "undefined";
          confirmationLevel = cfg[target] ?? "wait-receipt";
        } else {
          confirmationLevel = "wait-receipt";
        }
      }

      // Adapt the input format for the new batcher
      const adaptedInput = {
        address: batcherInput.address,
        addressType: batcherInput.addressType,
        input: batcherInput.input,
        signature: batcherInput.signature,
        timestamp: batcherInput.timestamp,
        target: batcherInput.target,
      };

      // Both admission phases charge the SAME buckets, so they are built once
      // here: a surcharge landing on a different key would leave the flat unit
      // stranded on one budget and the real cost on another.
      const bucketsFor = (target: string) => {
        const adapter = batcher.getAdapter(target);
        const strategy = adapter?.getRateLimitKeyStrategy?.() ?? "ip";
        return buildRateLimitBuckets(
          strategy,
          target,
          request.ip,
          adaptedInput.address,
          maxRequests,
          globalMaxRequests,
        );
      };

      // Add input to batcher with confirmation level
      const result = await batcher.batchInput(
        adaptedInput as any,
        confirmationLevel,
        body.timeoutMs,
        async ({ target }) => {
          const rateLimitResult = await rateLimiter.checkBuckets(
            bucketsFor(target),
          );
          if (!rateLimitResult.allowed) {
            throw new RateLimitExceededError(rateLimitResult);
          }
        },
        // Admission surcharge. The flat unit above was charged before the
        // payload had been read; this charges what the input actually costs,
        // now that the adapter has measured it, and still before anything is
        // written to storage.
        async ({ target, weight, alreadyCharged }) => {
          const surcharge = weight - alreadyCharged;
          if (surcharge <= 0) return;
          const rateLimitResult = await rateLimiter.checkBuckets(
            bucketsFor(target).map((bucket) => ({
              ...bucket,
              weight: surcharge,
            })),
          );
          if (rateLimitResult.allowed) return;

          // The limiter reports no retry time when a request is heavier than
          // the bucket itself — waiting cannot make it fit. That is a property
          // of the transaction, not of current load, so it is a permanent
          // rejection rather than a 429 the caller would retry forever.
          if (rateLimitResult.retryAfterSeconds === undefined) {
            throw new InputValidationError(
              `Transaction is too expensive to validate: it costs ${weight} ` +
                `units, more than this target's entire admission budget. ` +
                `Reduce the number of shielded inputs, outputs and transients.`,
              413,
              "TRANSACTION_TOO_EXPENSIVE",
              false,
            );
          }
          throw new RateLimitExceededError(rateLimitResult);
        },
      );

      // Return appropriate response based on confirmation level
      switch (confirmationLevel) {
        case "no-wait":
          return {
            success: true,
            message: "Input queued for batching",
            inputsProcessed: 1,
          };
        case "wait-receipt":
          return {
            success: true,
            message: "Input processed successfully",
            transactionHash: result?.hash,
            inputsProcessed: 1,
          };
        case "wait-effectstream-processed":
          return {
            success: true,
            message: "Input processed and validated by EffectStream",
            transactionHash: result?.hash,
            rollup: result?.rollup,
            inputsProcessed: 1,
          };
        default:
          return {
            success: true,
            message: "Input processed successfully",
            inputsProcessed: 1,
          };
      }
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        const retryAfter = error.result.retryAfterSeconds ?? 60;
        reply.header("Retry-After", String(retryAfter));
        return reply.status(429).send({
          success: false,
          error: "Rate limit exceeded",
          message: `Too many requests. Please retry after ${retryAfter} seconds.`,
          retryAfter,
        });
      }

      console.error("Error adding input to batcher:", error);

      if (error instanceof InputValidationError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: "Validation failed",
          message: error.message,
          ...(error.errorCode !== undefined ? { errorCode: error.errorCode } : {}),
          ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
        });
      }

      return reply.status(500).send({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  if (ENV.ENABLE_DEV_AND_DEBUG_ENDPOINTS) {
    // Force process current batch (useful for testing/debugging)
    server.post("/force-batch", {
      schema: {
        tags: ["developer"],
        querystring: Type.Object({ target: Type.Optional(Type.String()) }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
            remainingInputs: Type.Number(),
          }),
          500: Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    }, async (request, reply) => {
      try {
        const target = (request.query as { target?: string })?.target;
        await batcher.forceProcessBatches(target);
        const status = await batcher.getBatchingStatus();
        return {
          success: true,
          message: target
            ? `Batch processing forced for target ${target}`
            : "Batch processing forced",
          remainingInputs: status.totalPendingInputs,
        };
      } catch (error) {
        console.error("Error forcing batch:", error);
        return reply.status(500).send({
          success: false,
          error: "Failed to force batch processing",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Clear pending inputs (administrative endpoint).
    // `?target=` scopes the wipe to one product — without it, a shared
    // multi-product batcher would nuke every tenant's queue.
    server.delete("/clear-inputs", {
      schema: {
        tags: ["developer"],
        querystring: Type.Object({ target: Type.Optional(Type.String()) }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            message: Type.String(),
          }),
        },
      },
    }, async (request) => {
      try {
        const target = (request.query as { target?: string })?.target;
        const cleared = await batcher.clearPendingInputs(target);
        return {
          success: true,
          message: target
            ? `Cleared ${cleared} pending input(s) for target ${target}`
            : "All pending inputs cleared",
        };
      } catch (error) {
        console.error("Error clearing inputs:", error);
        return {
          success: false,
          error: "Failed to clear inputs",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });
  }

  // Start the server
  const address = await server.listen({ port, host: "0.0.0.0" });
  console.log(`🎯 Batcher HTTP server running on ${address}`);
  console.log(
    `📖 OpenAPI documentation available at ${address}/documentation`,
  );
  return server;
}
