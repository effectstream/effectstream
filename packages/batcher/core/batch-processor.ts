import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { DefaultBatcherInput } from "./types.ts";
import * as fs from "node:fs";

// Custom logger for debugging
function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync("batcher-debug.log", logMessage);
  } catch (e) {
    // Ignore if we can't write
  }
  console.log(message);
}

/**
 * Handles the complex batch processing logic for a specific target.
 * Separated from the main Batcher class to improve maintainability.
 */
export class BatchProcessor<T extends DefaultBatcherInput> {
  constructor(
    private batcher: {
      emitStateTransition: (prefix: string, payload: any) => Promise<void>;
      storage: {
        removeProcessedInputs: (inputs: T[], target: string) => Promise<void>;
        incrementRetryCount: (
          inputs: T[],
          target: string,
          maxRetries: number,
        ) => Promise<void>;
      };
      submissionCallbacks: Map<
        string,
        {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
          timeoutId: ReturnType<typeof setTimeout>;
        }
      >;
      waitForEffectStreamProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => Promise<{ latestBlock: number; rollup: number } | null>;
      getCallbackKey: (input: T) => string;
      getRetryPolicy: () => { maxRetries: number; retryDelayMs: number };
      setTargetCooldown: (target: string, ms: number) => void;
    },
  ) {}

  /**
   * Classify a batch-wide failure. INFRASTRUCTURE failures (no spendable
   * dust, unreachable node/indexer/prover, timeouts) are conditions of the
   * batcher's environment, not of the inputs — retrying the same inputs
   * later will succeed, so their retry budgets must NOT be charged.
   * Everything else is treated as an input failure.
   */
  static isInfraFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /could not balance dust|Insufficient Funds|Unable to connect|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket|network|timed? ?out|Service Unavailable|Bad Gateway|502|503|pool timed out/i
      .test(message);
  }

  async processBatchForTarget(
    adapter: BlockchainAdapter<any>,
    target: string,
    inputs: T[],
    timeout: number = 60000,
  ): Promise<void> {
    console.log(`🔗 Processing ${inputs.length} inputs for target: ${target}`);

    // Build batch data directly from adapter
    const batchResult = adapter.buildBatchData(inputs as DefaultBatcherInput[]);

    if (!batchResult || !batchResult.data) {
      console.log(`📭 No valid inputs for target ${target}, skipping...`);
      return;
    }

    const { selectedInputs, data } = batchResult; // data is 'unknown'

    await this.submitAndConfirmTransaction(
      adapter,
      target,
      data,
      selectedInputs as T[],
      timeout,
    );
  }

  private async submitAndConfirmTransaction(
    adapter: BlockchainAdapter<any>,
    target: string,
    data: unknown, // CHANGED from hexData: string
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    debugLog(
      `[BatchProcessor] Starting submitAndConfirmTransaction for target ${target} with ${selectedInputs.length} inputs`,
    );

    try {
      const estimatedFee = await adapter.estimateBatchFee(data);

      this.batcher.emitStateTransition("batch:fee-estimate", {
        target,
        estimatedFee,
        time: Date.now(),
      });

      debugLog(
        `[BatchProcessor] Calling adapter.submitBatch for target ${target}`,
      );
      // Snapshot before submitBatch: the adapter may splice elements from the
      // same array (batchData.selectedInputs === selectedInputs) before throwing,
      // so we need the original list to know which inputs actually failed.
      const inputsSnapshot = [...selectedInputs];

      const { maxRetries, retryDelayMs } = this.batcher.getRetryPolicy();

      let hash: string;
      try {
        hash = await adapter.submitBatch(data, estimatedFee);
      } catch (error) {
        if (BatchProcessor.isInfraFailure(error)) {
          // PARK, don't drop: the environment failed, not the inputs. Leave
          // retry counts untouched and pause the target so the poll loop
          // doesn't burn worker slots on a known-bad environment.
          const cooldownMs = Math.max(retryDelayMs, 1000);
          console.warn(
            `[BatchProcessor] Infra failure for target ${target} — parking ` +
              `${inputsSnapshot.length} input(s) untouched, cooldown ${cooldownMs}ms: ${
                error instanceof Error ? error.message : error
              }`,
          );
          this.batcher.setTargetCooldown(target, cooldownMs);
          throw error;
        }
        // Input failure — increment retry counts; storage drops (with a
        // warning) those that hit the configured limit.
        debugLog(
          `[BatchProcessor] submitBatch threw for target ${target}, incrementing retry counts for ${inputsSnapshot.length} inputs (maxRetries=${maxRetries})`,
        );
        await this.batcher.storage
          .incrementRetryCount(inputsSnapshot, target, maxRetries)
          .catch((e) =>
            debugLog(`[BatchProcessor] Failed to increment retry counts: ${e}`)
          );
        throw error;
      }
      debugLog(`[BatchProcessor] adapter.submitBatch returned hash: ${hash}`);

      this.batcher.emitStateTransition("batch:submit", {
        target,
        estimatedFee,
        txHash: hash,
        time: Date.now(),
      });

      // Check if the adapter mutated selectedInputs in the data object
      // This is a pattern used by some adapters (like midnight-balancing) to handle partial failures
      let finalSelectedInputs = selectedInputs;
      if (
        data && typeof data === "object" && "selectedInputs" in data &&
        Array.isArray((data as any).selectedInputs)
      ) {
        finalSelectedInputs = (data as any).selectedInputs as T[];
        debugLog(
          `[BatchProcessor] Adapter mutated selectedInputs. New length: ${finalSelectedInputs.length}`,
        );
        // Diff against the snapshot (not the mutated selectedInputs) to find failed inputs
        const finalSet = new Set(finalSelectedInputs);
        const failedInputs = inputsSnapshot.filter((i) => !finalSet.has(i));
        if (failedInputs.length > 0) {
          debugLog(
            `[BatchProcessor] Incrementing retry count for ${failedInputs.length} failed inputs (maxRetries=${maxRetries})`,
          );
          await this.batcher.storage
            .incrementRetryCount(failedInputs, target, maxRetries)
            .catch((e) =>
              debugLog(
                `[BatchProcessor] Failed to increment retry counts: ${e}`,
              )
            );
        }
      }

      debugLog(
        `[BatchProcessor] Submitting ${finalSelectedInputs.length} inputs for target ${target} with hash ${hash}`,
      );

      // Wait for confirmation and EffectStream processing
      // Use the adapter's specific timeout if available, otherwise fallback to the default
      const adapterTimeout = (adapter as any).config?.receiptTimeoutMs ||
        timeout;

      debugLog(
        `[BatchProcessor] Calling handleTransactionConfirmation for hash ${hash} with timeout ${adapterTimeout}`,
      );
      await this.handleTransactionConfirmation(
        adapter,
        target,
        hash,
        finalSelectedInputs,
        adapterTimeout,
      );
    } finally {
      // Release all batch resources (workers + input reservations).
      // This runs AFTER all storage operations (removeProcessedInputs on
      // success, incrementRetryCount on failure), preventing the race where
      // a poll tick re-picks an input that is still in storage.
      if (typeof adapter.releaseBatchResources === "function") {
        try {
          adapter.releaseBatchResources(data);
        } catch (releaseError) {
          debugLog(
            `[BatchProcessor] releaseBatchResources failed: ${releaseError}`,
          );
        }
      }
    }
  }

  private async handleTransactionConfirmation(
    adapter: BlockchainAdapter<any>,
    target: string,
    hash: string,
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    debugLog(
      `[BatchProcessor] Waiting for transaction receipt for ${hash} (timeout: ${timeout}ms)...`,
    );
    const receipt = await adapter.waitForTransactionReceipt(hash, timeout);
    debugLog(
      `[BatchProcessor] Got transaction receipt for ${hash} at block ${receipt.blockNumber}`,
    );

    this.batcher.emitStateTransition("batch:receipt", {
      target,
      blockNumber: receipt.blockNumber,
      time: Date.now(),
    });

    // Remove processed inputs from storage after successful receipt
    debugLog(
      `[BatchProcessor] Removing ${selectedInputs.length} processed inputs from storage for target ${target}...`,
    );
    await this.batcher.storage.removeProcessedInputs(selectedInputs, target);
    debugLog(`[BatchProcessor] Successfully removed inputs from storage.`);

    // Resolve all callbacks with the receipt
    // Individual callers will decide if they want to continue waiting for EffectStream
    this.resolveInputCallbacks(selectedInputs, receipt);

    // Optional: Still trigger EffectStream processing check for event emission
    this.waitForEffectStreamProcessing(
      receipt,
      adapter,
      target,
      timeout,
    ).catch((error) => {
      console.error(
        `⚠️ Error waiting for EffectStream processing for target ${target}:`,
        error,
      );
    });
  }

  private async waitForEffectStreamProcessing(
    receipt: BlockchainTransactionReceipt,
    _adapter: BlockchainAdapter<any>,
    target: string,
    timeout: number,
  ): Promise<void> {
    try {
      const processingResult = await this.batcher.waitForEffectStreamProcessed(
        target,
        receipt,
        timeout,
      );

      if (processingResult) {
        this.batcher.emitStateTransition("batch:effectstream-processed", {
          target,
          latestBlock: processingResult.latestBlock,
          rollup: processingResult.rollup,
          time: Date.now(),
        });
      } else {
        console.error(
          `❌ EffectStream processing validation failed for target ${target}`,
        );
        this.batcher.emitStateTransition("error", {
          phase: "effectstream",
          target,
          error: new Error("EffectStream processing validation failed"),
          time: Date.now(),
        });
      }
    } catch (error) {
      console.error(
        `❌ Error waiting for EffectStream processing for target ${target}:`,
        error,
      );
      this.batcher.emitStateTransition("error", {
        phase: "effectstream",
        target,
        error,
        time: Date.now(),
      });
    }
  }

  private resolveInputCallbacks(
    selectedInputs: T[],
    receipt: BlockchainTransactionReceipt,
  ): void {
    const hashes = receipt.hash.split(",");
    const isMultiHash = hashes.length === selectedInputs.length;

    for (let i = 0; i < selectedInputs.length; i++) {
      const input = selectedInputs[i];
      const callbackKey = this.batcher.getCallbackKey(input);
      const callbacks = this.batcher.submissionCallbacks.get(callbackKey);
      if (callbacks) {
        const inputHash = isMultiHash ? hashes[i] : receipt.hash;

        if (receipt.status === 0 && !isMultiHash) {
          callbacks.reject(
            new Error(`Transaction failed on-chain: ${inputHash}`),
          );
        } else {
          const inputReceipt = isMultiHash
            ? { ...receipt, hash: inputHash }
            : receipt;
          callbacks.resolve(inputReceipt);
        }

        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(callbackKey);
      }
    }
  }
}
