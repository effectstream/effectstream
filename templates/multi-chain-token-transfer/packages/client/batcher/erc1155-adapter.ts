import type {
  Account,
  Chain,
  Hash,
  PublicClient,
  TransactionReceipt as ViemTransactionReceipt,
  WalletClient,
} from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import type { EvmAddress, EvmPrivateKey } from "@paimaexample/utils";
import { hexStringToUint8Array } from "@paimaexample/utils";
import type { BlockchainAdapter } from "@paimaexample/batcher";

// Type conversion utilities
function viemReceiptToGenericReceipt(
  receipt: ViemTransactionReceipt,
) {
  return {
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status === "success" ? 1 : 0,
    // Include original receipt for EVM-specific access if needed
    _viemReceipt: receipt,
  };
}

/**
 * ERC1155 adapter for the Paima batcher
 * Only handles mint() and custom transferToMidnight() function calls on the ERC1155 contract
 */
export class ERC1155CustomAdapter implements BlockchainAdapter {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: Account;
  private readonly erc1155Address: EvmAddress;
  private readonly syncProtocolName: string;
  public readonly maxBatchSize: number;

  // ERC1155 contract ABI with mint and transferToMidnight functions
  private readonly erc1155Abi = [
    {
      inputs: [
        { name: "_to", type: "address" },
        { name: "_amount", type: "uint256" },
      ],
      name: "mint",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        { name: "_amount", type: "uint256" },
        { name: "_target_account", type: "address" },
      ],
      name: "transferToMidnight",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ] as const;

  constructor(
    erc1155Address: EvmAddress,
    batcherPrivateKey: EvmPrivateKey,
    chain: Chain,
    syncProtocolName: string,
    maxBatchSize: number = 10000,
  ) {
    this.erc1155Address = erc1155Address;
    this.syncProtocolName = syncProtocolName;
    this.maxBatchSize = maxBatchSize;

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
    return this.syncProtocolName;
  }

  /**
   * Submit a batch transaction to the ERC1155 contract
   * Parses hex-encoded JSON payload and calls appropriate function
   */
  async submitBatch(
    data: string,
    fee?: string | bigint,
  ) {
    try {
      const payload = this.parseBatchPayload(data);

      if (payload.payloads.length === 0) {
        throw new Error("Batch payload contained no function calls");
      }

      if (payload.payloads.length > 1) {
        console.warn(
          `⚠️ ERC1155 adapter received ${payload.payloads.length} function calls in a single batch. ` +
            "Currently only the first call will be processed.",
        );
      }

      const { function: functionName, args } = payload.payloads[0];

      console.log(
        `🔄 Calling function "${functionName}" with ${args.length} arguments`,
      );

      let hash;

      // Route to appropriate contract function
      switch (functionName) {
        case "mint": {
          if (args.length !== 2) {
            throw new Error(
              `mint() expects 2 arguments (address, amount), got ${args.length}`,
            );
          }
          const [to, amount] = args;
          hash = await this.walletClient.writeContract({
            account: this.account,
            chain: this.walletClient.chain,
            address: this.erc1155Address,
            abi: this.erc1155Abi,
            functionName: "mint",
            args: [to as `0x${string}`, BigInt(amount)],
          });
          break;
        }

        case "transferToMidnight": {
          if (args.length !== 2) {
            throw new Error(
              `transferToMidnight() expects 2 arguments (amount, targetAddress), got ${args.length}`,
            );
          }
          const [amount, targetAddress] = args;
          hash = await this.walletClient.writeContract({
            account: this.account,
            chain: this.walletClient.chain,
            address: this.erc1155Address,
            abi: this.erc1155Abi,
            functionName: "transferToMidnight",
            args: [BigInt(amount), targetAddress as `0x${string}`],
          });
          break;
        }

        default:
          throw new Error(
            `Unsupported function: ${functionName}. Supported functions: mint, transferToMidnight`,
          );
      }

      console.log(`🚀 Submitted transaction: ${hash}`);
      return hash;
    } catch (error) {
      console.error("❌ Failed to submit batch:", error);
      throw new Error(
        `Failed to submit batch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Wait for a transaction to be confirmed on the blockchain
   */
  async waitForTransactionReceipt(
    hash: string,
    timeout?: number,
  ) {
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
   * Estimate the fee for submitting a batch
   * Returns 0 as fees are handled by the wallet
   */
  estimateBatchFee(data: string): bigint {
    return 0n;
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
   * Get the ERC1155 contract address
   */
  getContractAddress(): EvmAddress {
    return this.erc1155Address;
  }

  /**
   * Parse batch payload from hex-encoded JSON
   * Expected format: {"prefix": "&B", "payloads": [{function: "mint", args: [...]}, ...]}
   */
  private parseBatchPayload(data: string): {
    prefix: string;
    payloads: Array<{ function: string; args: any[] }>;
  } {
    const decoded = this.decodeHexString(data);
    let payload: unknown;
    try {
      payload = JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to parse ERC1155 batch payload JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid ERC1155 batch payload structure");
    }

    const { prefix, payloads } = payload as {
      prefix: unknown;
      payloads: Array<{
        function: unknown;
        args: unknown;
      }>;
    };

    if (prefix !== "&B") {
      throw new Error(`Invalid batch prefix: expected "&B", got "${prefix}"`);
    }

    if (!Array.isArray(payloads)) {
      throw new Error(
        "Invalid ERC1155 batch payload structure: missing payloads array",
      );
    }

    const sanitized = payloads.map((entry, index) => {
      if (!entry || typeof entry.function !== "string") {
        throw new Error(`Invalid function name at index ${index}`);
      }

      if (!Array.isArray(entry.args)) {
        throw new Error(`Invalid function args at index ${index}`);
      }

      return { function: entry.function, args: entry.args };
    });

    return { prefix: prefix as string, payloads: sanitized };
  }

  /**
   * Decode hex string to UTF-8 string
   */
  private decodeHexString(hex: string): string {
    const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
    try {
      return new TextDecoder().decode(hexStringToUint8Array(normalized));
    } catch (error) {
      throw new Error(
        `Failed to decode ERC1155 batch payload hex: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

