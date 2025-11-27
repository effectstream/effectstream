// Implements a adapter interface for the batcher responsible for handling blockchain interactions

import type { DefaultBatcherInput } from "../core/types.ts";

/**
 * Generic blockchain transaction hash type
 * Can represent transaction hashes from any blockchain
 */
export type BlockchainHash = string;

/**
 * Result of input validation operations
 */
export type ValidationResult = {
  /** Whether the input is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
};

/**
 * Generic blockchain transaction receipt type
 * Contains common fields that most blockchains have
 */
export interface BlockchainTransactionReceipt {
  /** Transaction hash */
  hash: BlockchainHash;
  /** Block number where transaction was included */
  blockNumber: bigint;
  /** Transaction status (1 = success, 0 = failure) */
  status: number;
  /** Additional blockchain-specific fields can be added via extension */
  [key: string]: any;
}

/**
 * Options for batch building
 */
export interface BatchBuildingOptions {
  /** Maximum size of the batch in bytes */
  maxSize?: number;
}

/**
 * Result of batch building operation
 */
export interface BatchBuildingResult<TOutput> {
  /** Inputs that were selected for this batch */
  selectedInputs: DefaultBatcherInput[];
  /** Serialized batch data. The type (TOutput) is defined by the adapter implementation. */
  data: TOutput;
}

/**
 * Base interface for blockchain adapters that handle chain-specific operations
 * Provides a unified interface for different blockchain interactions
 */
export interface BlockchainAdapter<TOutput> {
  /**
   * Submit a batch transaction to the blockchain.
   * @param data - The type-safe batch data, as constructed by buildBatchData.
   * @param fee - The fee to pay for the transaction.
   * @returns Promise resolving to transaction hash
   */
  submitBatch(data: TOutput, fee: string | bigint): Promise<BlockchainHash>;

  /**
   * Estimate the fee for submitting a batch.
   * @param data - The type-safe batch data payload to estimate for.
   * @returns Estimated fee
   */
  estimateBatchFee(data: TOutput): Promise<string | bigint> | string | bigint;

  /**
   * Build batch data from a collection of inputs.
   * This method is now part of the adapter itself.
   * @param inputs - Array of inputs to batch
   * @param options - Options for batch building
   * @returns Batch building result or null if no inputs could be batched
   */
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions,
  ): BatchBuildingResult<TOutput> | null;

  /**
   * Wait for a transaction to be confirmed on the blockchain
   * @param hash - The transaction hash to wait for
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise resolving to transaction receipt
   */
  waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number,
  ): Promise<BlockchainTransactionReceipt>;

  /**
   * Get the current account/address for this adapter
   * @returns The account address as a string
   */
  getAccountAddress(): string;

  /**
   * Get the current chain name or identifier
   * @returns The chain name/identifier
   */
  getChainName(): string;

  /**
   * Check if the adapter is ready to submit transactions
   * @returns True if the adapter is operational
   */
  isReady(): boolean;

  /**
   * Get the block number of the latest confirmed block
   * @returns Promise resolving to current block number
   */
  getBlockNumber(): Promise<bigint>;

  /**
   * Optional sync protocol name used to filter EffectStream Sync events
   * If not provided, the batcher will fall back to the adapter's chain name
   */
  getSyncProtocolName?(): string;

  /**
   * (Optional) Verifies the input signature.
   * If not implemented, the batcher will use its default EVM verification logic.
   * Adapters for chains without signatures (like Midnight) should override this
   * to return `true`.
   * @param input - The input containing the signature.
   * @returns A promise resolving to true if the signature is valid.
   */
  verifySignature?(input: DefaultBatcherInput): boolean | Promise<boolean>;

  /**
   * (Optional) Validate an input _before_ it is added to the storage queue.
   * This is used for adapter-specific semantic validation, like checking
   * circuit arguments or payload formats.
   * @param input - The input to validate.
   * @returns A promise resolving to a ValidationResult.
   */
  validateInput?(
    input: DefaultBatcherInput,
  ): ValidationResult | Promise<ValidationResult>;

  /**
   * (Optional) Recover adapter state after batcher initialization.
   * This is called after storage.init() but before processing starts,
   * allowing adapters to rebuild internal state from persisted inputs.
   * Useful for stateful adapters (e.g., Bitcoin tracking reserved funds).
   * @param pendingInputs - All pending inputs for this adapter from storage.
   */
  recoverState?(pendingInputs: DefaultBatcherInput[]): Promise<void> | void;
}
