/**
 * Batch data builder interface for the Paima Batcher
 *
 * This interface defines how batch data is constructed from individual inputs.
 * Different blockchain targets may require different batch formatting strategies.
 */

import { DefaultBatcherInput } from "../core/types.ts";

/**
 * Options for batch building
 */
export interface BatchBuildingOptions {
  /** Maximum size of the batch in bytes */
  maxSize?: number;
  /** Target chain/adapter name */
  target?: string;
}

/**
 * Result of batch building operation
 */
export interface BatchBuildingResult<T> {
  /** Inputs that were selected for this batch */
  selectedInputs: T[];
  /** Serialized batch data ready for blockchain submission */
  data: string;
}

/**
 * Interface for building batch data from individual inputs
 *
 * Implementations can provide chain-specific optimizations and formatting
 */
export interface BatchDataBuilder<T extends DefaultBatcherInput> {
  /**
   * Build batch data from a collection of inputs
   *
   * @param inputs - Array of inputs to batch
   * @param options - Options for batch building
   * @returns Batch building result or null if no inputs could be batched
   */
  buildBatchData(
    inputs: T[],
    options?: BatchBuildingOptions,
  ): BatchBuildingResult<T> | null;
}
