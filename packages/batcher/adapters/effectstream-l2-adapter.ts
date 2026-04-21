import type {
  Account,
  Chain,
  Hash,
  PublicClient,
  TransactionReceipt as ViemTransactionReceipt,
  WalletClient,
} from "viem";
import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import { DefaultBatchBuilderLogic } from "../batch-data-builder/default-builder-logic.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { createPublicClient, createWalletClient, http } from "viem";
import * as chains from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { EvmAddress, EvmPrivateKey } from "@effectstream/utils";
import { AdapterLogger } from "./adapter-logger.ts";

// Type conversion utilities
function viemReceiptToGenericReceipt(
  receipt: ViemTransactionReceipt,
): BlockchainTransactionReceipt {
  return {
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status === "success" ? 1 : 0,
    // Include original receipt for EVM-specific access if needed
    _viemReceipt: receipt,
  };
}

function encodeHexFromString(value: string): `0x${string}` {
  const bytes = new TextEncoder().encode(value);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/**
 * EVM-specific implementation of the blockchain adapter interface
 * Handles all EVM blockchain interactions including transaction submission and confirmation
 */
export class EffectstreamL2DefaultAdapter implements BlockchainAdapter<string> {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: Account;
  private readonly effectstreamL2Address: EvmAddress;
  private readonly effectstreamL2Fee: bigint;
  private readonly effectstreamSyncProtocolName: string;
  public readonly maxBatchSize: number;
  private readonly log = new AdapterLogger("effectstream-l2");

  // Private helper for building batch data
  private readonly batchBuilderLogic = new DefaultBatchBuilderLogic();

  // TODO: Import this from the actual ABI package when available
  private readonly effectstreamL2Abi = [
    {
      inputs: [{ name: "data", type: "bytes" }],
      name: "effectstreamSubmitGameInput",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
  ] as const;

  constructor(
    effectstreamL2Address: EvmAddress,
    batcherPrivateKey: EvmPrivateKey,
    effectstreamL2Fee: bigint,
    effectstreamSyncProtocolName: string,
    chain: Chain = chains.hardhat,
    maxBatchSize: number = 10000,
  ) {
    this.effectstreamL2Address = effectstreamL2Address;
    this.effectstreamL2Fee = effectstreamL2Fee;
    this.effectstreamSyncProtocolName = effectstreamSyncProtocolName;
    this.maxBatchSize = maxBatchSize;

    // Initialize viem clients
    this.account = privateKeyToAccount(batcherPrivateKey);

    this.walletClient = createWalletClient({
      chain,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });
  }

  /**
   * Return the EffectStream Sync protocol name used for event filtering
   */
  getSyncProtocolName(): string {
    return this.effectstreamSyncProtocolName;
  }

  /**
   * Build batch data from a collection of inputs
   */
  public buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<string> | null {
    const options = {
      maxSize: this.maxBatchSize,
    };
    // Cast is safe because we know our helper returns a string
    return this.batchBuilderLogic.buildBatchData(inputs, options) as BatchBuildingResult<string> | null;
  }

  /**
   * Submit a batch transaction to the EffectstreamL2 contract
   */
  async submitBatch(
    data: string,
    fee?: string | bigint,
  ): Promise<BlockchainHash> {
    let actualFee = this.effectstreamL2Fee;
    if (fee) {
      actualFee = typeof fee === "string" ? BigInt(fee) : fee;
    }
    const hexData = encodeHexFromString(data);
    const hash = await this.walletClient.writeContract({
      account: this.account,
      chain: this.walletClient.chain,
      address: this.effectstreamL2Address,
      abi: this.effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [hexData],
      value: actualFee,
    });

    this.log.log(`Submitted batch transaction: ${hash}`);
    return hash;
  }

  /**
   * Wait for a transaction to be confirmed on the blockchain
   */
  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number,
  ): Promise<BlockchainTransactionReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: hash as Hash,
      timeout,
    });

    this.log.log(
      `Transaction confirmed! Block: ${receipt.blockNumber}, Hash: ${hash}, Status: ${receipt.status}`,
    );

    return viemReceiptToGenericReceipt(receipt);
  }

  /**
   * Get the current account/address for this adapter
   */
  getAccountAddress(): string {
    return this.account.address;
  }

  /**
   * Get the current chain name or identifier
   */
  getChainName(): string {
    return this.walletClient.chain?.name || "Unknown EVM Chain";
  }

  /**
   * Estimate the fee for submitting a batch (returns the configured EffectstreamL2 fee)
   * This matches the approach used in the old batcher implementation which
   * simply used the pre-configured fee rather than performing complex estimation.
   */
  estimateBatchFee(data: string): bigint {
    // Note: Fee estimation doesn't need hex encoding since it just returns the configured fee
    return this.effectstreamL2Fee;
  }

  /**
   * Check if the adapter is ready to submit transactions
   */
  isReady(): boolean {
    return this.walletClient !== undefined && this.publicClient !== undefined;
  }

  /**
   * Get the block number of the latest confirmed block
   */
  async getBlockNumber(): Promise<bigint> {
    return await this.publicClient.getBlockNumber();
  }

  /**
   * Get the underlying wallet client for advanced operations
   */
  getWalletClient(): WalletClient {
    return this.walletClient;
  }

  /**
   * Get the underlying public client for advanced operations
   */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  /**
   * Get the EffectstreamL2 contract address
   */
  getContractAddress(): EvmAddress {
    return this.effectstreamL2Address;
  }
}
