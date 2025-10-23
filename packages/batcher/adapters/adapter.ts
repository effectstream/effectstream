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
 * Base interface for blockchain adapters that handle chain-specific operations
 * Provides a unified interface for different blockchain interactions
 */
export interface BlockchainAdapter {
  /**
   * Submit a batch transaction to the blockchain
   * @param data - The batch data to submit (hex encoded)
   * @param fee - The fee to pay for the transaction (blockchain-specific format)
   * @returns Promise resolving to transaction hash
   */
  submitBatch(data: string, fee: string | bigint): Promise<BlockchainHash>;

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
   * Estimate the fee for submitting a batch
   * @param data - The batch data to estimate for
   * @returns Estimated fee (may be synchronous or asynchronous depending on implementation)
   */
  estimateBatchFee(data: string): Promise<string | bigint> | string | bigint;

  /**
   * Maximum batch payload size in bytes for this adapter/chain.
   * Used by the batch data builder to limit batch size per target.
   */
  maxBatchSize?: number;

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
   * Optional sync protocol name used to filter Paima Sync events
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
}
