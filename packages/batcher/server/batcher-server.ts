import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { type Static, Type } from "@sinclair/typebox";
import type { PaimaBatcher } from "../core/batcher.ts";
import fastifySwagger, {
  type FastifyDynamicSwaggerOptions,
} from "@fastify/swagger";
import fastifySwaggerUi, {
  type FastifySwaggerUiOptions,
} from "@fastify/swagger-ui";

// TypeBox schema for BatchedSubunit (adapted for new batcher input format)
const BatcherInputSchema = Type.Object({
  address: Type.String(),
  addressType: Type.Number(),
  input: Type.String(),
  signature: Type.String(),
  timestamp: Type.String(),
  target: Type.Optional(Type.String()),
});

const BatcherInputWrapper = Type.Object({
  data: BatcherInputSchema,
  confirmationLevel: Type.Union([
    Type.Literal("no-wait"),
    Type.Literal("wait-receipt"),
    Type.Literal("wait-paima-processed"),
  ], {
    default: "wait-receipt",
  }),
});

type BatcherInputWrapper = Static<typeof BatcherInputWrapper>;

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
        title: "Paima Batcher",
        description:
          "Paima Batcher API - Simplified architecture with configuration-driven batching",
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
    reply.status(500).send({ ok: false });
  });
}

/**
 * Start the batcher HTTP server.
 * @param batcher - PaimaBatcher instance.
 * @param port - The port to listen on.
 */
export async function startBatcherHttpServer(
  batcher: PaimaBatcher<any>,
  port: number,
): Promise<any> {
  const server = fastify();

  await registerOpenApiDocumentation(server, port);

  await server.register(cors as any, { origin: "*" });

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
            pendingInputs: Type.Number(),
            criteriaType: Type.String(),
            timeSinceLastProcess: Type.Number(),
            connectorTargets: Type.Array(Type.String()),
          }),
          config: Type.Object({
            pollingIntervalMs: Type.Number(),
            defaultTarget: Type.String(),
            enableHttpServer: Type.Boolean(),
            enableEventSystem: Type.Boolean(),
            confirmationLevel: Type.String(),
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
        pendingInputs: status.pendingInputs,
        criteriaType: status.criteriaType,
        timeSinceLastProcess: status.timeSinceLastProcess,
        connectorTargets: status.connectorTargets,
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
          pendingInputs: Type.Number(),
          isReady: Type.Boolean(),
          criteriaType: Type.String(),
          timeSinceLastProcess: Type.Number(),
        }),
      },
    },
  }, async () => {
    const status = await batcher.getBatchingStatus();
    return {
      pendingInputs: status.pendingInputs,
      isReady: status.isReady,
      criteriaType: status.criteriaType,
      timeSinceLastProcess: status.timeSinceLastProcess,
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
        }),
        202: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
          transactionHash: Type.Optional(Type.String()),
          rollup: Type.Optional(Type.Number()),
        }),
      },
    },
  }, async (
    request: FastifyRequest<{ Body: BatcherInputWrapper }>,
    reply,
  ) => {
    try {
      const batcherInput = request.body.data;
      const confirmationLevel = request.body.confirmationLevel ||
        "wait-receipt";

      // Adapt the input format for the new batcher
      const adaptedInput = {
        address: batcherInput.address,
        addressType: batcherInput.addressType,
        input: batcherInput.input,
        signature: batcherInput.signature,
        timestamp: batcherInput.timestamp,
        target: batcherInput.target,
      };

      // Add input to batcher with confirmation level
      const result = await batcher.batchInput(
        adaptedInput as any,
        confirmationLevel,
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
        case "wait-paima-processed":
          return {
            success: true,
            message: "Input processed and validated by Paima Engine",
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
      console.error("Error adding input to batcher:", error);
      return reply.status(500).send({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Force process current batch (useful for testing/debugging)
  server.post("/force-batch", {
    schema: {
      tags: ["developer"],
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
  }, async (_, reply) => {
    try {
      await batcher.forceProcessBatches();
      const status = await batcher.getBatchingStatus();
      return {
        success: true,
        message: "Batch processing forced",
        remainingInputs: status.pendingInputs,
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

  // Clear all pending inputs (administrative endpoint)
  server.delete("/clear-inputs", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
        }),
      },
    },
  }, async () => {
    try {
      await batcher.clearPendingInputs();
      return {
        success: true,
        message: "All pending inputs cleared",
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

  // Start the server
  server.listen(
    { port, host: "0.0.0.0" },
    (err: Error | null, address: string) => {
      if (err) {
        console.error("Batcher HTTP server error:", err);
        throw err;
      }
      console.log(`🎯 Paima Batcher HTTP server running on ${address}`);
      console.log(
        `📖 OpenAPI documentation available at ${address}/documentation`,
      );
    },
  );
}
