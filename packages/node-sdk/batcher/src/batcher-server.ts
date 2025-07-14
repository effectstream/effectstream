import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { type Operation, run, until } from "effection";
import type { BatchedSubunit } from "@paima/concise";
import { Type } from "@sinclair/typebox";
import type { Batcher } from "./batcher.ts";
import fastifySwagger, {
  type FastifyDynamicSwaggerOptions,
} from "@fastify/swagger";
import fastifySwaggerUi, {
  type FastifySwaggerUiOptions,
} from "@fastify/swagger-ui";
// TypeBox schema for BatchedSubunit
const BatchedSubunitSchema = Type.Object({
  addressType: Type.Number(),
  userAddress: Type.String(),
  userSignature: Type.String(),
  gameInput: Type.String(),
  millisecondTimestamp: Type.String(),
});

/**
 * Register the OpenAPI documentation for the batcher server.
 * Create the OpenAPI specification and the UI.
 * UI is attached at /documentations
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
        title: "Paima Batcher",
        description: "Paima Batcher API",
        version: "0.1.0",
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

  yield* until(server.register(fastifySwagger, openApiOptions));

  yield* until(server.register(fastifySwaggerUi, uiOptions));
}

/**
 * Start the batcher HTTP server.
 * @param batcher - Batcher instance.
 * @param port - The port to listen on.
 */
export function* startBatcherHttpServer(
  batcher: Batcher,
  port: number,
): Operation<void> {
  const server = fastify();

  // OpenAPI Docs
  yield* registerOpenApiDocumentation(server, port);

  // Allow any webpage to access the server.
  // This node is not specific for a specific website.
  yield* until(server.register(cors, {
    origin: "*",
  }));

  // Health check endpoint
  server.get("/health", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          status: Type.String(),
          isRunning: Type.Boolean(),
          isProcessingBatch: Type.Boolean(),
        }),
      },
    },
  }, async () => {
    const stats = await run(() => batcher.getQueueStats());
    return {
      status: "ok",
      isRunning: stats.isRunning,
      isProcessingBatch: stats.isProcessingBatch,
    };
  });

  // Status endpoint with detailed information
  server.get("/status", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          batcher: Type.Object({
            isRunning: Type.Boolean(),
            isProcessingBatch: Type.Boolean(),
            pendingInputs: Type.Number(),
          }),
          config: Type.Object({
            paimaL2Address: Type.String(),
            batcherAddress: Type.String(),
            chainName: Type.String(),
            batchIntervalSeconds: Type.Number(),
            paimaL2Fee: Type.String(),
            namespace: Type.String(),
            maxBatchSize: Type.Number(),
          }),
          timestamp: Type.String(),
        }),
      },
    },
  }, async () => {
    const stats = await run(() => batcher.getQueueStats());
    const config = batcher.getPublicConfig();
    return {
      batcher: {
        isRunning: stats.isRunning,
        isProcessingBatch: stats.isProcessingBatch,
        pendingInputs: stats.pendingInputs,
      },
      config,
      timestamp: new Date().toISOString(),
    };
  });

  // Get queue statistics
  server.get("/queue-stats", {
    schema: {
      tags: ["developer"],
      response: {
        200: Type.Object({
          pendingInputs: Type.Number(),
          processingBatch: Type.Boolean(),
          lastBatchTimestamp: Type.String(),
        }),
      },
    },
  }, async () => {
    return await batcher.getQueueStats();
  });

  // Add user input to batcher
  server.post("/send-input", {
    schema: {
      tags: ["batcher"],
      body: BatchedSubunitSchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String(),
          queueSize: Type.Number(),
        }),
      },
    },
  }, async (
    request: FastifyRequest<{ Body: BatchedSubunit }>,
    reply,
  ) => {
    try {
      const batchedSubunit = request.body;

      const success = await run(() => batcher.addUserInput(batchedSubunit));

      if (success) {
        const stats = await run(() => batcher.getQueueStats());
        return {
          success: true,
          message: "Input added to batch queue",
          queueSize: stats.pendingInputs,
        };
      } else {
        return reply.status(400).send({
          error: "Failed to add input to batch queue",
        });
      }
    } catch (error) {
      console.error("Error adding input to batcher:", error);
      return reply.status(500).send({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // TODO Only in dev mode.
  // Force process current batch (useful for testing/debugging)
  server.post("/force-batch", async (_, reply) => {
    try {
      await batcher.forceBatch();
      const stats = await run(() => batcher.getQueueStats());
      return {
        success: true,
        message: "Batch processing forced",
        remainingInputs: stats.pendingInputs,
      };
    } catch (error) {
      console.error("Error forcing batch:", error);
      return reply.status(500).send({
        error: "Failed to force batch processing",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // TODO Only in dev mode.
  // Clear all pending inputs (administrative endpoint)
  server.delete("/clear-inputs", async () => {
    try {
      await batcher.clearPendingInputs();
      return {
        success: true,
        message: "All pending inputs cleared",
      };
    } catch (error) {
      console.error("Error clearing inputs:", error);
      return {
        error: "Failed to clear inputs",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  yield* until(server.ready());

  // Start the server
  server.listen(
    { port, host: "0.0.0.0" },
    (err: Error | null, address: string) => {
      if (err) {
        console.error("Batcher HTTP server error:", err);
      }
      console.log(`🎯 Paima Batcher HTTP server running on ${address}`);
    },
  );
}
