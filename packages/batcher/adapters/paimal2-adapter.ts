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
import type { EvmAddress, EvmPrivateKey } from "@paima/utils";

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
export class PaimaL2DefaultAdapter implements BlockchainAdapter<string> {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: Account;
  private readonly paimaL2Address: EvmAddress;
  private readonly paimaL2Fee: bigint;
  private readonly paimaSyncProtocolName: string;
  public readonly maxBatchSize: number;

  // Private helper for building batch data
  private readonly batchBuilderLogic = new DefaultBatchBuilderLogic();

  // TODO: Import this from the actual ABI package when available
  private readonly paimaL2Abi = [
    {
      inputs: [{ name: "data", type: "bytes" }],
      name: "paimaSubmitGameInput",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
  ] as const;

  constructor(
    paimaL2Address: EvmAddress,
    batcherPrivateKey: EvmPrivateKey,
    paimaL2Fee: bigint,
    paimaSyncProtocolName: string,
    chain: Chain = chains.hardhat,
    maxBatchSize: number = 10000,
  ) {
    this.paimaL2Address = paimaL2Address;
    this.paimaL2Fee = paimaL2Fee;
    this.paimaSyncProtocolName = paimaSyncProtocolName;
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
   * Return the Paima Sync protocol name used for event filtering
   */
  getSyncProtocolName(): string {
    return this.paimaSyncProtocolName;
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
   * Submit a batch transaction to the PaimaL2 contract
   */
  async submitBatch(
    data: string,
    fee?: string | bigint,
  ): Promise<BlockchainHash> {
    let actualFee = this.paimaL2Fee;
    if (fee) {
      actualFee = typeof fee === "string" ? BigInt(fee) : fee;
    }
    const hexData = encodeHexFromString(data);
    const hash = await this.walletClient.writeContract({
      account: this.account,
      chain: this.walletClient.chain,
      address: this.paimaL2Address,
      abi: this.paimaL2Abi,
      functionName: "paimaSubmitGameInput",
      args: [hexData],
      value: actualFee,
    });

    console.log(`🚀 Submitted batch transaction: ${hash}`);
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

    console.log(
      `✅ Transaction confirmed! Block: ${receipt.blockNumber}, Hash: ${hash}, Status: ${receipt.status}`,
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
   * Estimate the fee for submitting a batch (returns the configured PaimaL2 fee)
   * This matches the approach used in the old batcher implementation which
   * simply used the pre-configured fee rather than performing complex estimation.
   */
  estimateBatchFee(data: string): bigint {
    // Note: Fee estimation doesn't need hex encoding since it just returns the configured fee
    return this.paimaL2Fee;
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
   * Get the PaimaL2 contract address
   */
  getContractAddress(): EvmAddress {
    return this.paimaL2Address;
  }
}
