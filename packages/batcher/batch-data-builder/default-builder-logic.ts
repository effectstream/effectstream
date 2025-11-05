/**
 * Default batch builder logic implementation
 *
 * This implementation follows the same logic as the original @effectstream/concise buildBatchData
 * but works with the generic DefaultBatcherInput type and supports target-specific configurations.
 */

import type { DefaultBatcherInput } from "../core/types.ts";

const BATCHER_GRAMMAR_PREFIX = "&B";

export class DefaultBatchBuilderLogic {
  /**
   * Build batch data using the standard EffectStream batching algorithm
   *
   * @param inputs - Array of inputs to batch
   * @param options - Options for batch building
   * @returns Batch building result or null if no inputs could be batched
   */
  buildBatchData<T extends DefaultBatcherInput>(
    inputs: T[],
    options?: {
      /** Maximum size of the batch in bytes */
      maxSize?: number;
    },
  ): { selectedInputs: T[]; data: string } | null {
    return this.buildDefaultBatchData(inputs, options);
  }

  /**
   * Internal implementation of the default batch building logic
   */
  private buildDefaultBatchData<T extends DefaultBatcherInput>(
    inputs: T[],
    options?: {
      /** Maximum size of the batch in bytes */
      maxSize?: number;
    },
  ): { selectedInputs: T[]; data: string } | null {
    if (inputs.length === 0) return null;

    const maxSize = options?.maxSize ?? 10000;
    const selectedInputs: T[] = [];
    const batchedTransaction: string[] = [];

    // Calculate initial remaining space
    let remainingSpace = maxSize - `["${BATCHER_GRAMMAR_PREFIX}", []`.length;

    for (const input of inputs) {
      const packed = this.generateStmInput(input);

      if (packed.length + 1 > remainingSpace) break;

      const packedString = JSON.stringify(packed);
      batchedTransaction.push(packedString);

      // Update remaining space calculation
      remainingSpace -= JSON.stringify(packed).length - '[""]'.length -
        ",".length;
      selectedInputs.push(input);
    }

    if (batchedTransaction.length === 0) {
      return null;
    }

    const batchedData = this.generateBatchStmInput(batchedTransaction);
    return {
      selectedInputs,
      data: JSON.stringify(batchedData),
    };
  }

  /**
   * Generate STM input for individual batched subunit
   * This replicates the logic from generateStmInput in @effectstream/sdk/concise
   *
   * @param input - The batcher input data
   * @returns Array representation of the STM input
   */
  private generateStmInput(input: DefaultBatcherInput): any[] {
    // e.g. [addressType, userAddress, userSignature, conciseInput, millisecondTimestamp]
    return [
      `${input.addressType}`,
      input.address,
      input.signature,
      input.input,
      input.timestamp,
    ];
  }

  /**
   * Generate the outer STM input for the batch
   * This replicates the logic for creating the batch wrapper
   *
   * @param batchedTransaction - Array of serialized individual inputs
   * @returns Array representation of the batched STM input
   */
  private generateBatchStmInput(batchedTransaction: string[]): any[] {
    // e.g. ["&B", [input1, input2, ...]]
    return [
      BATCHER_GRAMMAR_PREFIX,
      batchedTransaction,
    ];
  }
}
