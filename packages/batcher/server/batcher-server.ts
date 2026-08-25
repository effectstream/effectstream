import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { type Static, Type } from "@sinclair/typebox";
import type { Batcher, DefaultBatcherInput } from "../core/mod.ts";
import {
  InputTerminalError,
  InputValidationError,
} from "../core/batcher.ts";
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

    if (error instanceof InputTerminalError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: "On-chain transaction failed",
        message: error.message,
        requestId: error.requestId,
        transactionHash: error.transactionHash,
        errorCode: error.errorCode,
        retryable: error.retryable,
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
          // Batcher-level, beside totalPendingInputs rather than inside a
          // target: retention and boot reconciliation are properties of this
          // process, not of any one product's adapter.
          //
          // `enabled: false` is a real answer, not a missing one — a sweep that
          // silently stopped working looks exactly like a sweep with nothing to
          // do, and the difference only shows up as unbounded growth weeks
          // later.
          retention: Type.Object({
            enabled: Type.Boolean(),
            keepCount: Type.Number(),
            ttlMs: Type.Number(),
            intervalMs: Type.Number(),
            prunedLastRun: Type.Number(),
            prunedTotal: Type.Number(),
            lastRunAt: Type.Optional(Type.String()),
            lastError: Type.Optional(Type.String()),
          }),
          // Counters that moved at boot are evidence the previous process did
          // not stop cleanly. Absent entirely on a queue-only backend, which
          // has nothing to reconcile.
          reconciliation: Type.Optional(Type.Object({
            synthesizedFromRows: Type.Number(),
            orphanedStatuses: Type.Number(),
          })),
          // FR-012b. Visible without provoking a 501, and carrying the remedy:
          // "this deployment keeps no statuses" is a configuration fact, and
          // an operator should be able to read it off a health surface rather
          // than infer it from a poll that failed.
          requestTracking: Type.Object({
            enabled: Type.Boolean(),
            reason: Type.Optional(Type.String()),
            enableWith: Type.Optional(Type.String()),
            disabled: Type.Optional(Type.Array(Type.String())),
          }),
        }),
      },
    },
  }, async () => {
    const status = await batcher.getBatchingStatus();
    const reconciliation = batcher.getReconciliationReport();
    return {
      totalPendingInputs: status.totalPendingInputs,
      retention: batcher.getRetentionStatus(),
      requestTracking: batcher.getRequestTrackingInfo(),
      ...(reconciliation ? { reconciliation } : {}),
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
          // Fields are ADDED here, never removed (spec FR-009): an existing
          // client keeps reading exactly what it read before.
          //
          // `requestId` is not optional. It is a pure function of the payload,
          // so it exists at every confirmation level and on every backend — the
          // point of FR-001 is that a 200 is never an answer you cannot follow
          // up on. Poll it at `GET /input-status/:requestId`.
          requestId: Type.String({
            description:
              "Stable id for this request; poll GET /input-status/{requestId}.",
          }),
          // Present only when true. A client testing presence should not be
          // told a duplicate check happened on a backend that cannot do one.
          duplicate: Type.Optional(Type.Boolean({
            description:
              "This submission replayed a request already tracked; nothing new " +
              "was queued and `requestId` is the ORIGINAL request's.",
          })),
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
        // The input was accepted and submitted, but its shared transaction was
        // mined unsuccessfully. This is terminal execution, not validation.
        422: Type.Union([
          Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            requestId: Type.String(),
            transactionHash: Type.String(),
            errorCode: Type.Literal("ONCHAIN_FAILED"),
            retryable: Type.Literal(false),
          }),
          // Existing adapters may use 422 for a deterministic late validation
          // verdict. Preserve that additive contract alongside terminal chain
          // execution without requiring transaction fields it cannot have.
          Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            errorCode: Type.Optional(Type.String()),
            retryable: Type.Optional(Type.Boolean()),
          }),
        ]),
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

      // A duplicate short-circuits the confirmation levels, because there is
      // nothing left to wait FOR: the replay gate recognised this spend as one
      // already tracked, queued nothing, and therefore has no receipt coming at
      // any level (Phase 3 — `receipt` is null by construction). Rendering it
      // through the `wait-receipt` branch would produce a 200 with no hash and
      // no explanation, which reads exactly like a batch that never landed.
      //
      // It is still a SUCCESS: the caller's request is tracked, under the id in
      // this body, and their retry cost them nothing. That is the idempotency
      // FR-006b promises.
      if (result.duplicate) {
        return {
          success: true,
          message:
            "Duplicate submission: this request is already tracked. Poll " +
            "requestId for its outcome; nothing was queued or charged again.",
          inputsProcessed: 1,
          requestId: result.requestId,
          duplicate: true,
        };
      }

      // Return appropriate response based on confirmation level
      switch (confirmationLevel) {
        case "no-wait":
          return {
            success: true,
            message: "Input queued for batching",
            inputsProcessed: 1,
            requestId: result.requestId,
          };
        case "wait-receipt":
          return {
            success: true,
            message: "Input processed successfully",
            transactionHash: result.receipt?.hash,
            inputsProcessed: 1,
            requestId: result.requestId,
          };
        case "wait-effectstream-processed":
          return {
            success: true,
            message: "Input processed and validated by EffectStream",
            transactionHash: result.receipt?.hash,
            rollup: result.receipt?.rollup,
            inputsProcessed: 1,
            requestId: result.requestId,
          };
        default:
          return {
            success: true,
            message: "Input processed successfully",
            inputsProcessed: 1,
            requestId: result.requestId,
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

      if (error instanceof InputTerminalError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: "On-chain transaction failed",
          message: error.message,
          requestId: error.requestId,
          transactionHash: error.transactionHash,
          errorCode: error.errorCode,
          retryable: error.retryable,
        });
      }

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

  // Poll a request by id (spec FR-003).
  //
  // ALWAYS registered, and it answers 501 when this deployment keeps no
  // statuses (spec FR-012b, revising plan Q-P2's "do not register it"). Not
  // registering it means Fastify answers 404 — the same answer this endpoint
  // gives for an id that aged out — so a client could never tell "your id
  // expired" from "this deployment tracks nothing". Those have completely
  // different remedies, and the second one is a single environment variable.
  {
    server.get("/input-status/:requestId", {
      schema: {
        tags: ["batcher"],
        params: Type.Object({
          requestId: Type.String({
            description: "The id returned in the /send-input 200 body.",
          }),
        }),
        response: {
          200: Type.Object({
            // The three answers the user asked for. Everything the store knows
            // collapses onto these; `subState` carries the detail.
            status: Type.Union([
              Type.Literal("complete"),
              Type.Literal("incomplete"),
              Type.Literal("failed"),
            ]),
            subState: Type.String({
              description:
                "Lifecycle state: queued | batching | submitted | confirmed | failed.",
            }),
            transactionHash: Type.Optional(Type.String()),
            blockNumber: Type.Optional(Type.Number()),
            errorCode: Type.Optional(Type.String()),
            message: Type.Optional(Type.String()),
            retryCount: Type.Number(),
            acceptedAt: Type.String({ description: "ISO-8601." }),
          }),
          400: Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            reason: Type.String(),
          }),
          404: Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            reason: Type.String(),
          }),
          429: Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            retryAfter: Type.Optional(Type.Number()),
          }),
          // Declared, not improvised: Fastify serialises through these schemas
          // and silently drops any property they do not mention, so an
          // undeclared 501 body would reach the caller stripped of the very
          // fields that make it actionable.
          501: Type.Object({
            success: Type.Boolean(),
            error: Type.String(),
            message: Type.String(),
            reason: Type.String({
              description: "Stable code: request-tracking-disabled.",
            }),
            enableWith: Type.String({
              description: "The single setting that enables tracking.",
            }),
          }),
        },
      },
    }, async (request: FastifyRequest, reply) => {
      // Same pre-auth IP bucket as /send-input (spec FR-008). The read is cheap,
      // but "cheap" times "unauthenticated and unbounded" is an amplification
      // vector, and it is the one budget a scraper would otherwise skip
      // entirely by never submitting anything.
      const preAuthRateLimitResult = await rateLimiter.checkBuckets(
        buildPreAuthRateLimitBuckets(request.ip, preAuthMaxRequests),
      );
      if (!preAuthRateLimitResult.allowed) {
        const retryAfter = preAuthRateLimitResult.retryAfterSeconds ?? 60;
        reply.header("Retry-After", String(retryAfter));
        return reply.status(429).send({
          success: false,
          error: "Rate limit exceeded",
          message:
            `Too many requests. Please retry after ${retryAfter} seconds.`,
          retryAfter,
        });
      }

      // Answered before the id is even looked at: when this deployment keeps
      // no statuses, the shape of the caller's id is not the caller's problem.
      const tracking = batcher.getRequestTrackingInfo();
      if (!tracking.enabled) {
        return reply.status(501).send({
          success: false,
          error: "Request tracking not enabled",
          message:
            `This batcher runs on queue-only storage, so no request status is ` +
            `kept and there is nothing to poll. Inputs are still queued, ` +
            `batched and retried, and /send-input still returns a requestId. ` +
            `Set ${tracking.enableWith} to enable durable tracking (and with ` +
            `it replay/dedup protection); leaving it unset is a ` +
            `development-only configuration.`,
          reason: "request-tracking-disabled",
          enableWith: tracking.enableWith!,
        });
      }

      const { requestId } = request.params as { requestId: string };

      // Refuse a shape that cannot be an id before spending a database round
      // trip on it. It also gives the caller the right diagnosis: "your id is
      // malformed" and "we have no record of that request" are very different
      // bugs, and answering both with 404 would conflate them.
      if (!/^[0-9a-f]{64}$/.test(requestId)) {
        return reply.status(400).send({
          success: false,
          error: "Invalid request id",
          message:
            "A requestId is 64 lowercase hexadecimal characters, as returned " +
            "in the /send-input response.",
          reason: "malformed-id",
        });
      }

      const record = await batcher.getRequestStatus(requestId);
      if (!record) {
        // Deliberately ONE reason, not the unknown-vs-expired split the spec
        // permits: retention deletes the status record and its replay key
        // together (Phase 3), so nothing survives a prune to distinguish an
        // aged-out id from one we never saw. Inventing the distinction would
        // mean keeping tombstones forever — unbounded growth, to answer a
        // question with the same remedy either way (resubmit).
        return reply.status(404).send({
          success: false,
          error: "Unknown request",
          message:
            "No record for this requestId: it was never accepted here, or it " +
            "has aged out of the status retention window.",
          reason: "unknown-or-expired",
        });
      }

      return {
        status: record.state === "confirmed"
          ? "complete" as const
          : record.state === "failed"
          ? "failed" as const
          : "incomplete" as const,
        subState: record.state,
        ...(record.transactionHash !== undefined
          ? { transactionHash: record.transactionHash }
          : {}),
        // Block numbers are bigint in the store and cannot be JSON; a missed
        // conversion is a 500 on a request that succeeded.
        ...(record.blockNumber !== undefined && record.blockNumber !== null
          ? { blockNumber: Number(record.blockNumber) }
          : {}),
        ...(record.errorCode !== undefined ? { errorCode: record.errorCode } : {}),
        ...(record.message !== undefined ? { message: record.message } : {}),
        retryCount: record.retryCount,
        acceptedAt: record.acceptedAt.toISOString(),
      };
    });
  }

  if (!batcher.isRequestTrackingEnabled()) {
    // Said once, at startup, naming the remedy. The alternative — discovering
    // it one 501 at a time — is how an operator concludes the feature is broken
    // rather than switched off.
    const tracking = batcher.getRequestTrackingInfo();
    console.warn(
      `⚠️ [Batcher] Request polling is DISABLED: GET /input-status/:requestId ` +
        `answers 501 because this batcher runs on queue-only storage. Inputs ` +
        `are still queued, batched and retried, and /send-input still returns ` +
        `a requestId — but no status is kept, so there is nothing to poll. ` +
        `Set ${tracking.enableWith} to enable it (development-only without it).`,
    );
  }

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
