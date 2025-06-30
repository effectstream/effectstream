import fastify, { type FastifyRequest } from "npm:fastify";
import cors from "npm:@fastify/cors";
import { type Operation, run } from "npm:effection";
import type { BatchedSubunit } from "@paima/concise";
import { Type } from "npm:@sinclair/typebox";
import type { Batcher } from "./batcher.ts";

// TypeBox schema for BatchedSubunit
const BatchedSubunitSchema = Type.Object({
  addressType: Type.Number(),
  userAddress: Type.String(),
  userSignature: Type.String(),
  gameInput: Type.String(),
  millisecondTimestamp: Type.String(),
});

export function* startBatcherHttpServer(
  batcher: Batcher,
  port: number,
): Operation<void> {
  console.log("Starting HTTP server");
  // Allow any webpage to access the server.
  // This node is not specific for a specific website.
  const server = fastify();
  console.log("Server created");

  server.register(cors, {
    origin: "*",
  });

  console.log("CORS registered");
  // Health check endpoint
  server.get("/health", async () => {
    const stats = await run(() => batcher.getQueueStats());
    return {
      status: "ok",
      isRunning: stats.isRunning,
      isProcessingBatch: stats.isProcessingBatch,
    };
  });

  // Status endpoint with detailed information
  server.get("/status", async () => {
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
  server.get("/queue-stats", async () => {
    return await batcher.getQueueStats();
  });

  // Add user input to batcher
  server.post("/send-input", {
    schema: {
      body: BatchedSubunitSchema,
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

  // Start the server
  console.log("Starting server on port", port);
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
