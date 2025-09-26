// Implement the EVM connector for the batcher

import type {
  Account,
  Chain,
  Hash,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { IChainConnector } from "./connector.ts";
import type { EvmAddress, EvmPrivateKey } from "@paima/utils";

/**
 * EVM-specific implementation of the chain connector interface
 * Handles all EVM blockchain interactions including transaction submission and confirmation
 */
export class EvmChainConnector implements IChainConnector {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: Account;
  private readonly paimaL2Address: EvmAddress;
  private readonly paimaL2Fee: bigint;
  private readonly paimaSyncProtocolName: string;

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
    chain: Chain,
    paimaL2Fee: bigint,
    paimaSyncProtocolName: string,
  ) {
    this.paimaL2Address = paimaL2Address;
    this.paimaL2Fee = paimaL2Fee;
    this.paimaSyncProtocolName = paimaSyncProtocolName;

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
   * Submit a batch transaction to the PaimaL2 contract
   */
  async submitBatch(data: string, fee?: string | bigint): Promise<Hash> {
    let actualFee = this.paimaL2Fee;
    if (fee) {
      actualFee = typeof fee === "string" ? BigInt(fee) : fee;
    }
    const hash = await this.walletClient.writeContract({
      account: this.account,
      chain: this.walletClient.chain,
      address: this.paimaL2Address,
      abi: this.paimaL2Abi,
      functionName: "paimaSubmitGameInput",
      args: [data as `0x${string}`],
      value: actualFee,
    });

    console.log(`🚀 Submitted batch transaction: ${hash}`);
    return hash;
  }

  /**
   * Wait for a transaction to be confirmed on the blockchain
   */
  async waitForTransactionReceipt(hash: Hash): Promise<TransactionReceipt> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    console.log(
      `✅ Transaction confirmed! Block: ${receipt.blockNumber}, Hash: ${hash}, Status: ${receipt.status}`,
    );

    return receipt;
  }

  /**
   * Get the current account/address for this connector
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
    return this.paimaL2Fee;
  }

  /**
   * Check if the connector is ready to submit transactions
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
