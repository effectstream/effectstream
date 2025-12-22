import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type { BatcherGrammar } from "./batcher-events.ts";


/**
 * Handles the complex batch processing logic for a specific target.
 * Separated from the main Batcher class to improve maintainability.
 */
export class BatchProcessor<T extends DefaultBatcherInput> {
  constructor(
    private batcher: {
      emitStateTransition: (prefix: string, payload: any) => Promise<void>;
      emitInputUpdate: (
        input: T,
        payload: Omit<BatcherGrammar["input:update"], "inputId" | "target" | "time">,
      ) => Promise<void>;
      removeProcessedIds: (inputs: T[]) => void;
      storage: { removeProcessedInputs: (inputs: T[], target: string) => Promise<void> };
      submissionCallbacks: Map<
        string,
        {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
          timeoutId: number;
        }
      >;
      waitForEffectStreamProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => Promise<{ latestBlock: number; rollup: number } | null>;
      getCallbackKey: (input: T) => string;
    },
  ) {}

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

    try {
      await this.submitAndConfirmTransaction(
        adapter,
        target,
        data,
        selectedInputs as T[],
        timeout,
      );
    } catch (error) {
      await this.emitInputUpdates(selectedInputs as T[], {
        phase: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async submitAndConfirmTransaction(
    adapter: BlockchainAdapter<any>,
    target: string,
    data: unknown, // CHANGED from hexData: string
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    const estimatedFee = await adapter.estimateBatchFee(data);

    this.batcher.emitStateTransition("batch:fee-estimate", {
      target,
      estimatedFee,
      time: Date.now(),
    });

    const hash = await adapter.submitBatch(data, estimatedFee);
    console.log(`✅ Submitted batch for ${target}: ${hash}`);

    this.batcher.emitStateTransition("batch:submit", {
      target,
      estimatedFee,
      txHash: hash,
      time: Date.now(),
    });
    await this.emitInputUpdates(selectedInputs, {
      phase: "submitted",
      txHash: hash,
    });

    // Wait for confirmation and EffectStream processing
    await this.handleTransactionConfirmation(
      adapter,
      target,
      hash,
      selectedInputs,
      timeout,
    );
  }

  private async handleTransactionConfirmation(
    adapter: BlockchainAdapter<any>,
    target: string,
    hash: string,
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    const receipt = await adapter.waitForTransactionReceipt(hash);
    this.batcher.emitStateTransition("batch:receipt", {
      target,
      blockNumber: receipt.blockNumber,
      time: Date.now(),
    });
    await this.emitInputUpdates(selectedInputs, {
      phase: "receipt",
      txHash: hash,
      blockNumber: receipt.blockNumber,
    });

    // Remove processed inputs from storage after successful receipt
    await this.batcher.storage.removeProcessedInputs(selectedInputs, target);
    this.batcher.removeProcessedIds(selectedInputs);

    // Resolve all callbacks with the receipt
    // Individual callers will decide if they want to continue waiting for EffectStream
    this.resolveInputCallbacks(selectedInputs, receipt);

    // Optional: Still trigger EffectStream processing check for event emission
    this.waitForEffectStreamProcessing(
      receipt,
      adapter,
      target,
      timeout,
      selectedInputs,
      hash,
    ).catch((error) => {
      console.error(
        `⚠️ Error waiting for EffectStream processing for target ${target}:`,
        error,
      );
    });
  }

  private async waitForEffectStreamProcessing(
    receipt: BlockchainTransactionReceipt,
    adapter: BlockchainAdapter<any>,
    target: string,
    timeout: number,
    selectedInputs: T[],
    txHash: string,
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
        await this.emitInputUpdates(selectedInputs, {
          phase: "effectstream-processed",
          txHash,
          rollup: processingResult.rollup,
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
        await this.emitInputUpdates(selectedInputs, {
          phase: "error",
          txHash,
          error: "EffectStream processing validation failed",
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
      await this.emitInputUpdates(selectedInputs, {
        phase: "error",
        txHash,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async emitInputUpdates(
    inputs: T[],
    payload: Omit<BatcherGrammar["input:update"], "inputId" | "target" | "time">,
  ): Promise<void> {
    await Promise.all(inputs.map((input) =>
      this.batcher.emitInputUpdate(input, payload)
    ));
  }

  private resolveInputCallbacks(
    selectedInputs: T[],
    receipt: BlockchainTransactionReceipt,
  ): void {
    for (const input of selectedInputs) {
      const callbackKey = this.batcher.getCallbackKey(input);
      const callbacks = this.batcher.submissionCallbacks.get(callbackKey);
      if (callbacks) {
        callbacks.resolve(receipt);
        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(callbackKey);
      }
    }
  }
}
