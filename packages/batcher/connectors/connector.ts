// Implements a connector interface for the batcher

/**
 * Generic blockchain transaction hash type
 * Can represent transaction hashes from any blockchain
 */
export type BlockchainHash = string;

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
 * Base interface for blockchain connectors that handle chain-specific operations
 * Provides a unified interface for different blockchain interactions
 */
export interface IChainConnector {
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
   * Get the current account/address for this connector
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
   * Check if the connector is ready to submit transactions
   * @returns True if the connector is operational
   */
  isReady(): boolean;

  /**
   * Get the block number of the latest confirmed block
   * @returns Promise resolving to current block number
   */
  getBlockNumber(): Promise<bigint>;

  /**
   * Optional sync protocol name used to filter Paima Sync events
   * If not provided, the batcher will fall back to the connector's chain name
   */
  getSyncProtocolName?(): string;
}
