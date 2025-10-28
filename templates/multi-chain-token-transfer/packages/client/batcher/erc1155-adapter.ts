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
import type { BlockchainAdapter, DefaultBatcherInput } from "@paimaexample/batcher";
import { DefaultBatchBuilderLogic } from "@paimaexample/batcher";
import { mct_erc1155 } from "@multi-chain-transfer/evm-contracts";

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
export class ERC1155CustomAdapter implements BlockchainAdapter<string | null> {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly account: Account;
  private readonly erc1155Address: EvmAddress;
  private readonly syncProtocolName: string;
  private readonly batchBuilderLogic: DefaultBatchBuilderLogic;
  public readonly maxBatchSize: number;

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
    this.batchBuilderLogic = new DefaultBatchBuilderLogic();
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

  buildBatchData(inputs: DefaultBatcherInput[], options?: { maxSize?: number }): { selectedInputs: DefaultBatcherInput[]; data: string } | null {
    return this.batchBuilderLogic.buildBatchData(inputs, options) as { selectedInputs: DefaultBatcherInput[]; data: string } | null;
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
      // Parse the default batch builder format: ["&B", [input1, input2, ...]]
      const batchArray = this.parseDefaultBatchFormat(data);
      
      if (batchArray.inputs.length === 0) {
        throw new Error("Batch payload contained no inputs");
      }

      if (batchArray.inputs.length > 1) {
        console.warn(
          `⚠️ ERC1155 adapter received ${batchArray.inputs.length} inputs in a single batch. ` +
            "Currently only the first input will be processed.",
        );
      }

      // Extract the first input: [addressType, address, signature, input, timestamp]
      const firstInput = JSON.parse(batchArray.inputs[0] as unknown as string);
      const inputData = firstInput[3]; // The 'input' field contains the hex-encoded function call

      // Parse the function call (inputs are now pre-validated, so this should succeed)
      const functionCall = this.parseFunctionCall(inputData);
      
      console.log(
        `🔄 Calling function "${functionCall.function}" with ${functionCall.args.length} arguments`,
      );
      console.log("args", JSON.stringify(functionCall.args));
      let hash;

      // Route to appropriate contract function
      switch (functionCall.function) {
        case "mint": {
          const [to, amount] = functionCall.args;
          hash = await this.walletClient.writeContract({
            account: this.account,
            chain: this.walletClient.chain,
            address: this.erc1155Address,
            abi: mct_erc1155.abi,
            functionName: "mint",
            args: [to as `0x${string}`, BigInt(amount)],
          });
          break;
        }

        case "transferToMidnight": {
          const [amount, targetAddress, txHash] = functionCall.args;
          hash = await this.walletClient.writeContract({
            account: this.account,
            chain: this.walletClient.chain,
            address: this.erc1155Address,
            abi: mct_erc1155.abi,
            functionName: "transferToMidnight",
            args: [BigInt(amount), targetAddress as `0x${string}`, txHash as `0x${string}`],
          });
          break;
        }

        default:
          // This should never happen since validation is done pre-queue
          throw new Error(
            `Unsupported function: ${functionCall.function}. Supported functions: mint, transferToMidnight`,
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
   * Pre-validate ERC1155 inputs before they enter the batch queue
   * Validates function call structure and arguments
   */
  validateInput(input: DefaultBatcherInput) {
    try {
      // The input.input field contains the hex-encoded function call
      const inputData = input.input;

      const functionCall = this.parseFunctionCall(inputData);

      switch (functionCall.function) {
        case "mint":
          if (functionCall.args.length !== 2) {
            return {
              valid: false,
              error: `mint() expects 2 arguments (address, amount), got ${functionCall.args.length}`,
            };
          }
          break;

        case "transferToMidnight":
          if (functionCall.args.length !== 3) {
            return {
              valid: false,
              error: `transferToMidnight() expects 3 arguments (amount, targetAddress, txHash), got ${functionCall.args.length}`,
            };
          }
          break;

        default:
          return {
            valid: false,
            error: `Unsupported function: ${functionCall.function}. Supported functions: mint, transferToMidnight`,
          };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }

  /**
   * Parse the default batch builder format: ["&B", [input1, input2, ...]]
   * Each input is: [addressType, address, signature, inputData, timestamp]
   */
  private parseDefaultBatchFormat(data: string): {
    prefix: string;
    inputs: any[][];
  } {
    const decoded = this.decodeHexString(data);
    let batchArray: unknown;
    try {
      batchArray = JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to parse batch array JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!Array.isArray(batchArray) || batchArray.length !== 2) {
      throw new Error(
        "Invalid batch format: expected array with 2 elements [prefix, inputs]",
      );
    }

    const [prefix, inputs] = batchArray;

    if (prefix !== "&B") {
      throw new Error(`Invalid batch prefix: expected "&B", got "${prefix}"`);
    }

    if (!Array.isArray(inputs)) {
      throw new Error(
        "Invalid batch format: second element must be an array of inputs",
      );
    }

    return { prefix, inputs };
  }

  /**
   * Parse a function call from the input data
   * Expected format: {"function": "mint", "args": [...]}
   */
  private parseFunctionCall(inputData: string): {
    function: string;
    args: any[];
  } {
    // The inputData might be hex-encoded or already a JSON string
    let decoded = inputData;
    if (inputData.startsWith("0x")) {
      decoded = this.decodeHexString(inputData);
    }

    let functionCall: unknown;
    try {
      functionCall = JSON.parse(decoded);
    } catch (error) {
      throw new Error(
        `Failed to parse function call JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (
      !functionCall || typeof functionCall !== "object" ||
      Array.isArray(functionCall)
    ) {
      throw new Error("Invalid function call structure");
    }

    const { function: functionName, args } = functionCall as {
      function: unknown;
      args: unknown;
    };

    if (typeof functionName !== "string") {
      throw new Error("Invalid function name");
    }

    if (!Array.isArray(args)) {
      throw new Error("Invalid function args");
    }

    return { function: functionName, args };
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

