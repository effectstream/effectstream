import { lift } from "effection";
import type { Operation } from "effection";
import type { DefaultBatcherInput } from "./types.ts";
import type { PaimaBatcher } from "./batcher.ts";

export interface BatcherShutdownState {
  isShuttingDown: boolean;
  shutdownInitiatedAt: number | null;
  shutdownTimeoutMs: number;
  isProcessingBatch: boolean;
}

export interface ShutdownHooks<
  T extends DefaultBatcherInput,
> {
  preShutdown?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  stopAcceptingInputs?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  waitForProcessing?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  cleanup?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  postShutdown?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
}

/**
 * Manages the graceful shutdown process for the batcher.
 * Separated from the main PaimaBatcher class to improve maintainability.
 */
export class ShutdownManager<T extends DefaultBatcherInput> {
  constructor(
    private batcherInterface: {
      shutdownState: BatcherShutdownState;
      stopPolling(): void;
      stopHttpServer(): Promise<void>;
      cleanupResources(): Promise<void>;
    },
    private batcherInstance: any, // For hooks that need the full batcher
  ) {}

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   * Effection-compatible version that can be used with yield*
   */
  *gracefulShutdownOp(
    hooks?: ShutdownHooks<any>,
    options?: { timeoutMs?: number; force?: boolean },
  ): Operation<void> {
    if (this.batcherInterface.shutdownState.isShuttingDown) return;

    this.batcherInterface.shutdownState.isShuttingDown = true;
    this.batcherInterface.shutdownState.shutdownInitiatedAt = Date.now();
    this.batcherInterface.shutdownState.shutdownTimeoutMs =
      options?.timeoutMs ??
        this.batcherInterface.shutdownState.shutdownTimeoutMs;

    console.log("🔄 Stopping batcher gracefully...");

    try {
      // Phase 1: Pre-shutdown (custom hook)
      if (hooks?.preShutdown) {
        yield* lift(hooks.preShutdown!)(this.batcherInstance);
      }

      // Phase 2: Stop accepting new inputs
      this.batcherInterface.stopPolling();
      yield* lift(this.batcherInstance.stopHttpServer)();
      if (hooks?.stopAcceptingInputs) {
        yield* lift(hooks.stopAcceptingInputs!)(this.batcherInstance);
      }

      // Phase 3: Wait for ongoing processing
      yield* lift(this.waitForOngoingProcessing)(options?.timeoutMs);
      if (hooks?.waitForProcessing) {
        yield* lift(hooks.waitForProcessing!)(this.batcherInstance);
      }

      // Phase 4: Cleanup resources
      yield* lift(this.batcherInstance.cleanupResources)();
      if (hooks?.cleanup) {
        yield* lift(hooks.cleanup!)(this.batcherInstance);
      }

      // Phase 5: Post-shutdown (custom hook)
      if (hooks?.postShutdown) {
        yield* lift(hooks.postShutdown!)(this.batcherInstance);
      }

      console.log("✅ Batcher shutdown complete");
    } catch (error) {
      console.error("❌ Error during graceful shutdown:", error);
      if (options?.force) {
        console.log("🔧 Force shutdown due to error");
      } else {
        throw error;
      }
    }
  }

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   * Legacy async version for backward compatibility
   */
  async gracefulShutdown(
    hooks?: ShutdownHooks<any>,
    options?: { timeoutMs?: number; force?: boolean },
  ): Promise<void> {
    if (this.batcherInterface.shutdownState.isShuttingDown) return;

    this.batcherInterface.shutdownState.isShuttingDown = true;
    this.batcherInterface.shutdownState.shutdownInitiatedAt = Date.now();
    this.batcherInterface.shutdownState.shutdownTimeoutMs =
      options?.timeoutMs ??
        this.batcherInterface.shutdownState.shutdownTimeoutMs;

    console.log("🔄 Stopping batcher gracefully...");

    try {
      // Phase 1: Pre-shutdown (custom hook)
      await hooks?.preShutdown?.(this.batcherInstance);

      // Phase 2: Stop accepting new inputs
      this.batcherInterface.stopPolling();
      await this.batcherInstance.stopHttpServer();
      await hooks?.stopAcceptingInputs?.(this.batcherInstance);

      // Phase 3: Wait for ongoing processing
      await this.waitForOngoingProcessing(options?.timeoutMs);
      await hooks?.waitForProcessing?.(this.batcherInstance);

      // Phase 4: Cleanup resources
      await this.batcherInterface.cleanupResources();
      await hooks?.cleanup?.(this.batcherInstance);

      // Phase 5: Post-shutdown (custom hook)
      await hooks?.postShutdown?.(this.batcherInstance);

      console.log("✅ Batcher shutdown complete");
    } catch (error) {
      console.error("❌ Error during graceful shutdown:", error);
      if (options?.force) {
        console.log("🔧 Force shutdown due to error");
      } else {
        throw error;
      }
    }
  }

  /**
   * Wait for any ongoing batch processing to complete
   */
  private async waitForOngoingProcessing(timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ??
      this.batcherInterface.shutdownState.shutdownTimeoutMs;
    const startTime = Date.now();

    if (!this.batcherInterface.shutdownState.isProcessingBatch) {
      return;
    }

    console.log("⏳ Waiting for current batch processing to complete...");

    while (this.batcherInterface.shutdownState.isProcessingBatch) {
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Shutdown timeout: batch processing did not complete within ${timeout}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Get shutdown status information
   */
  getShutdownStatus(): BatcherShutdownState {
    return {
      isShuttingDown: this.batcherInterface.shutdownState.isShuttingDown,
      shutdownInitiatedAt:
        this.batcherInterface.shutdownState.shutdownInitiatedAt,
      shutdownTimeoutMs: this.batcherInterface.shutdownState.shutdownTimeoutMs,
      isProcessingBatch: this.batcherInterface.shutdownState.isProcessingBatch,
    };
  }
}
