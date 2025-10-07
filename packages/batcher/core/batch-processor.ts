import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { BatchBuildingResult } from "../batch-data-builder/batch-data-builder.ts";
import { BuiltinEvents, PaimaEventManager } from "@paima/event-client";
import { toHex } from "viem";
import type { DefaultBatcherInput } from "./types.ts";

/**
 * Handles the complex batch processing logic for a specific target.
 * Separated from the main PaimaBatcher class to improve maintainability.
 */
export class BatchProcessor<T extends DefaultBatcherInput> {
  constructor(
    private batcher: {
      buildBatchData: (
        inputs: T[],
        target: string,
      ) => BatchBuildingResult<T> | null;
      emitStateTransition: (prefix: string, payload: any) => Promise<void>;
      storage: { removeProcessedInputs: (inputs: T[]) => Promise<void> };
      submissionCallbacks: Map<
        string,
        {
          resolve: (result: any) => void;
          reject: (error: Error) => void;
          timeoutId: number;
        }
      >;
    },
  ) {}

  async processBatchForTarget(
    adapter: BlockchainAdapter,
    target: string,
    inputs: T[],
    timeout: number = 60000,
  ): Promise<void> {
    console.log(`🔗 Processing ${inputs.length} inputs for target: ${target}`);

    // Build batch data using the target-specific batch builder
    const batchResult = this.batcher.buildBatchData(inputs, target);

    if (!batchResult || batchResult.data === "") {
      console.log(`📭 No valid inputs for target ${target}, skipping...`);
      return;
    }

    const { selectedInputs, data } = batchResult;

    const hexData = toHex(data);

    await this.submitAndConfirmTransaction(
      adapter,
      target,
      hexData,
      selectedInputs,
      timeout,
    );
  }

  private async submitAndConfirmTransaction(
    adapter: BlockchainAdapter,
    target: string,
    hexData: string,
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    const estimatedFee = await adapter.estimateBatchFee(hexData);

    this.batcher.emitStateTransition("batch:fee-estimate", {
      target,
      estimatedFee,
      time: Date.now(),
    });

    const hash = await adapter.submitBatch(hexData, estimatedFee);
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
    adapter: BlockchainAdapter,
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

    await this.waitForPaimaProcessing(
      receipt,
      adapter,
      target,
      selectedInputs,
      timeout,
    );
  }

  private async waitForPaimaProcessing(
    receipt: BlockchainTransactionReceipt,
    adapter: BlockchainAdapter,
    target: string,
    selectedInputs: T[],
    timeout: number,
  ): Promise<void> {
    try {
      const eventFilterChain = adapter.getSyncProtocolName?.() ??
        adapter.getChainName();
      const processingResult = await this.waitForPaimaProcessed(
        receipt,
        eventFilterChain,
        timeout,
      );

      await this.handleSuccessfulProcessing(
        processingResult,
        receipt,
        target,
        selectedInputs,
      );
    } catch (error) {
      await this.handleProcessingFailure(error, target, selectedInputs);
    }
  }

  private async handleSuccessfulProcessing(
    processingResult: { latestBlock: number; rollup: number } | null,
    receipt: BlockchainTransactionReceipt,
    target: string,
    selectedInputs: T[],
  ): Promise<void> {
    if (processingResult) {
      this.batcher.emitStateTransition("batch:paima-processed", {
        target,
        latestBlock: processingResult.latestBlock,
        rollup: processingResult.rollup,
        time: Date.now(),
      });

      await this.batcher.storage.removeProcessedInputs(selectedInputs);

      this.resolveInputCallbacks(
        selectedInputs,
        receipt,
        processingResult.rollup,
      );
    } else {
      // Error - keep inputs in storage for retry
      console.error(
        `❌ Paima processing validation failed for target ${target}`,
      );
      this.batcher.emitStateTransition("error", {
        phase: "paima",
        target,
        error: new Error("Paima processing validation failed"),
        time: Date.now(),
      });

      this.rejectInputCallbacks(
        selectedInputs,
        "Paima processing validation failed",
      );
    }
  }

  private async handleProcessingFailure(
    error: any,
    target: string,
    selectedInputs: T[],
  ): Promise<void> {
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

    this.rejectInputCallbacks(
      selectedInputs,
      error.message || "Unknown error during Paima processing",
    );
  }

  private resolveInputCallbacks(
    selectedInputs: T[],
    receipt: BlockchainTransactionReceipt,
    rollup: number,
  ): void {
    for (const input of selectedInputs) {
      const callbacks = this.batcher.submissionCallbacks.get(input.signature);
      if (callbacks) {
        callbacks.resolve({
          ...receipt,
          rollup,
        });
        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(input.signature);
      }
    }
  }

  private rejectInputCallbacks(
    selectedInputs: T[],
    errorMessage: string,
  ): void {
    for (const input of selectedInputs) {
      const callbacks = this.batcher.submissionCallbacks.get(input.signature);
      if (callbacks) {
        const error = new Error(errorMessage);
        callbacks.reject(error);
        clearTimeout(callbacks.timeoutId);
        this.batcher.submissionCallbacks.delete(input.signature);
      }
    }
  }

  private async waitForPaimaProcessed(
    transactionReceipt: BlockchainTransactionReceipt,
    chainName: string,
    timeout: number = 60000,
  ): Promise<{ latestBlock: number; rollup: number } | null> {
    let subscriptionReference: symbol | undefined = undefined;
    let latestBlock = 0;
    let timer: number | undefined = undefined;

    try {
      const result = await Promise.race([
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Timeout")), timeout);
        }),
        new Promise<{ latestBlock: number; rollup: number }>(
          (resolve, reject) => {
            PaimaEventManager.Instance.subscribe(
              {
                topic: BuiltinEvents.SyncChains,
                filter: { chain: chainName, block: undefined },
              },
              (event) => {
                latestBlock = Math.max(event.block, latestBlock);
                if (latestBlock > Number(transactionReceipt.blockNumber)) {
                  resolve({ latestBlock, rollup: event.rollup });
                }
              },
            )
              .then((subscription) => subscriptionReference = subscription)
              .catch(reject);
          },
        ),
      ]);
      return result || null;
    } catch (error) {
      console.error("Error waiting for Paima processing:", error);
      return null;
    } finally {
      if (subscriptionReference) {
        PaimaEventManager.Instance.unsubscribe(subscriptionReference);
      }
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
