import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { DefaultBatcherInput } from "./types.ts";


/**
 * Handles the complex batch processing logic for a specific target.
 * Separated from the main PaimaBatcher class to improve maintainability.
 */
export class BatchProcessor<T extends DefaultBatcherInput> {
  constructor(
    private batcher: {
      emitStateTransition: (prefix: string, payload: any) => Promise<void>;
      storage: { removeProcessedInputs: (inputs: T[], target: string) => Promise<void> };
      submissionCallbacks: Map<
        string,
        {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
          timeoutId: number;
        }
      >;
      waitForPaimaProcessed: (
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

    // Wait for confirmation and Paima processing
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

    // Remove processed inputs from storage after successful receipt
    await this.batcher.storage.removeProcessedInputs(selectedInputs, target);

    // Resolve all callbacks with the receipt
    // Individual callers will decide if they want to continue waiting for Paima
    this.resolveInputCallbacks(selectedInputs, receipt);

    // Optional: Still trigger Paima processing check for event emission
    this.waitForPaimaProcessing(
      receipt,
      adapter,
      target,
      timeout,
    ).catch((error) => {
      console.error(
        `⚠️ Error waiting for Paima processing for target ${target}:`,
        error,
      );
    });
  }

  private async waitForPaimaProcessing(
    receipt: BlockchainTransactionReceipt,
    adapter: BlockchainAdapter<any>,
    target: string,
    timeout: number,
  ): Promise<void> {
    try {
      const processingResult = await this.batcher.waitForPaimaProcessed(
        target,
        receipt,
        timeout,
      );

      if (processingResult) {
        this.batcher.emitStateTransition("batch:paima-processed", {
          target,
          latestBlock: processingResult.latestBlock,
          rollup: processingResult.rollup,
          time: Date.now(),
        });
      } else {
        console.error(
          `❌ Paima processing validation failed for target ${target}`,
        );
        this.batcher.emitStateTransition("error", {
          phase: "paima",
          target,
          error: new Error("Paima processing validation failed"),
          time: Date.now(),
        });
      }
    } catch (error) {
      console.error(
        `❌ Error waiting for Paima processing for target ${target}:`,
        error,
      );
      this.batcher.emitStateTransition("error", {
        phase: "paima",
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
