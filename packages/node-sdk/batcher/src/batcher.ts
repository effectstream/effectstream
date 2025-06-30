import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  toHex,
  type Transport,
  verifyMessage,
  type WalletClient,
} from "npm:viem";
import { privateKeyToAccount } from "npm:viem/accounts";
import { type BatchedSubunit, buildBatchData } from "@paima/concise";
import { AddressType } from "@paima/utils";
import { type BatcherStorage, FileStorage } from "./storage.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";
import { type Operation, sleep, spawn, until } from "npm:effection@3.5.0";

// TODO: Import this from the actual ABI package when available
const paimaL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "paimaSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

interface BatcherConfig {
  paimaL2Address: `0x${string}`;
  batcherPrivateKey: `0x${string}`;
  chain: Chain;
  batchIntervalSeconds?: number;
  paimaL2Fee: bigint;
  namespace?: string;
  maxBatchSize?: number;
  storage?: BatcherStorage; // TODO Probably we want to pass a DB connection instead.
  dataDirectory?: string; // TODO This is only for FileStorage.
  port: number;
}

export class Batcher {
  /* True while the main loop is running */
  private isRunning = false;
  /* True while the batcher is processing a batch */
  private isProcessingBatch = false;
  /* Pending batch interval checks in milliseconds */
  private batchInterval: number;
  /* EVM PaimaL2 contract address */
  private paimaL2Address: `0x${string}`;
  /* Viem-EVM Batcher account */
  private account: Account;
  /* Viem-EVM Wallet client */
  private walletClient: WalletClient;
  /* Viem-EVM Public client */
  private publicClient: PublicClient;
  /* PaimaL2 fee. This value is part of the PaimaL2 contract. */
  private paimaL2Fee: bigint;
  /* Namespace for the batcher */
  private namespace: string;
  /* Maximum batch size in inputs */
  // TODO Not yet implemented.
  private maxBatchSize: number;
  /* Storage for the batcher */
  private storage: BatcherStorage;

  constructor(config: BatcherConfig) {
    this.paimaL2Address = config.paimaL2Address;
    this.batchInterval = (config.batchIntervalSeconds ?? 5) * 1000; // Convert to milliseconds
    this.paimaL2Fee = config.paimaL2Fee;
    this.namespace = config.namespace ?? "";
    this.maxBatchSize = config.maxBatchSize ?? 10000; // Default max batch size

    // Initialize storage - use provided storage or create default file storage
    this.storage = config.storage ?? new FileStorage(config.dataDirectory);

    // Initialize viem clients
    this.account = privateKeyToAccount(config.batcherPrivateKey);

    this.walletClient = createWalletClient({
      chain: config.chain,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain: config.chain,
      transport: http(),
    });
  }

  /**
   * Initialize the batcher and its storage
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   */
  async gracefulShutdown(): Promise<void> {
    console.log("🔄 Stopping batcher gracefully...");
    this.isRunning = false;

    // Wait for any ongoing batch processing to complete
    if (this.isProcessingBatch) {
      console.log("⏳ Waiting for current batch processing to complete...");
      while (this.isProcessingBatch) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    console.log("✅ Batcher shutdown complete");
  }

  /**
   * Add a user input to the batch queue after validating the signature and checking for duplicates
   */
  *addUserInput(
    batchedSubunit: BatchedSubunit,
  ): Operation<boolean> {
    // Verify the signature
    // TODO: Add support for other address types
    if (batchedSubunit.addressType !== AddressType.EVM) {
      console.log("NYI support for address type", batchedSubunit.addressType);
      throw new Error("Address type not supported");
    }

    const messageVerified = yield* until(verifyMessage({
      address: batchedSubunit.userAddress as `0x${string}`,
      message: JSON.stringify({
        message: batchedSubunit.gameInput,
        timestamp: batchedSubunit.millisecondTimestamp,
      }),
      signature: batchedSubunit.userSignature as `0x${string}`,
    }));

    if (!messageVerified) {
      throw new Error("Invalid signature");
    }

    // Add to storage
    yield* this.storage.addInput(batchedSubunit);

    const { count, size } = yield* this.storage.getInputCountAndSize();
    console.log(
      `✅ Added input from ${batchedSubunit.userAddress} to batch queue. Queue size: ${count} inputs, ${size} bytes`,
    );
    return true;
  }

  /**
   * Process and send all pending inputs to the PaimaL2 contract
   */
  *processBatch(): Operation<void> {
    const pendingInputs = yield* this.storage.getAllInputs();

    if (pendingInputs.length === 0) {
      return;
    }

    this.isProcessingBatch = true;
    try {
      console.log(
        `🚀 Processing batch of ${pendingInputs.length} inputs...`,
      );

      // Build batch data using the SDK utility
      const { selectedInputs, data } = buildBatchData(
        this.maxBatchSize,
        pendingInputs,
      );

      if (data === "") {
        console.log("📭 No inputs fit in batch, skipping...");
        return;
      }

      // Submit to PaimaL2 contract
      const hash = yield* until(this.walletClient.writeContract({
        account: this.account,
        chain: this.walletClient.chain,
        address: this.paimaL2Address,
        abi: paimaL2Abi,
        functionName: "paimaSubmitGameInput",
        args: [toHex(data)],
        value: this.paimaL2Fee,
      }));

      // Wait for transaction confirmation
      const receipt = yield* until(
        this.publicClient.waitForTransactionReceipt({
          hash,
        }),
      );

      if (receipt.status === "success") {
        console.log("data", data);
        console.log(
          `✅ Batch submitted successfully! Block: ${receipt.blockNumber}, Hash: ${hash}`,
        );
        console.log(`   Processed ${selectedInputs.length} user inputs`);

        // Only now remove the successfully processed inputs from storage
        yield* this.storage.removeProcessedInputs(selectedInputs);
      } else {
        console.error(`❌ Batch submission failed! Hash: ${hash}`);
        // Don't remove inputs on failure - they remain in storage for retry
      }
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      // On error, inputs remain in storage for retry
    } finally {
      this.isProcessingBatch = false;
    }
  }

  /**
   * Stop the batcher service (for programmatic use)
   */
  stop(): void {
    console.log("🛑 Stopping batcher...");
    this.isRunning = false;
  }

  /**
   * Get current queue statistics
   */
  *getQueueStats(): Operation<{
    pendingInputs: number;
    pendingInputsSize: number;
    isRunning: boolean;
    isProcessingBatch: boolean;
  }> {
    const { count, size } = yield* this.storage.getInputCountAndSize();
    return {
      pendingInputs: count,
      pendingInputsSize: size,
      isRunning: this.isRunning,
      isProcessingBatch: this.isProcessingBatch,
    };
  }

  /**
   * Force process current batch (useful for testing)
   */
  *forceBatch(): Operation<void> {
    yield* this.processBatch();
  }

  /**
   * Clear processed hashes (useful for testing or periodic cleanup)
   */
  clearProcessedHashes(): void {
    console.log("🧹 Cleared processed hashes cache");
  }

  /**
   * Clear all pending inputs (useful for testing)
   */
  async clearPendingInputs(): Promise<void> {
    await this.storage.clearAllInputs();
    console.log("🧹 Cleared all pending inputs");
  }

  /**
   * Get batcher configuration information (safe for public exposure)
   */
  getPublicConfig(): {
    paimaL2Address: string;
    batcherAddress: string;
    chainName: string;
    batchIntervalSeconds: number;
    paimaL2Fee: string;
    namespace: string;
    maxBatchSize: number;
  } {
    return {
      paimaL2Address: this.paimaL2Address,
      batcherAddress: this.account.address,
      chainName: this.walletClient.chain?.name || "Unknown",
      batchIntervalSeconds: this.batchInterval / 1000,
      paimaL2Fee: this.paimaL2Fee.toString(),
      namespace: this.namespace,
      maxBatchSize: this.maxBatchSize,
    };
  }

  *mainLoop(): Operation<void> {
    this.isRunning = true;
    while (this.isRunning) {
      try {
        yield* this.processBatch();
      } catch (error) {
        console.error("❌ Error in batch processing loop:", error);
      }

      yield* sleep(this.batchInterval);
    }
  }
}

/**
 * Static method to create and start a batcher with graceful shutdown handling
 */
export function* createAndLaunchBatcher(
  config: BatcherConfig,
): Operation<void> {
  const batcher = new Batcher(config);

  // Set up signal handlers for graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
    await batcher.gracefulShutdown();
    Deno.exit(0);
  };

  // Listen for common shutdown signals
  Deno.addSignalListener("SIGINT", () => shutdown("SIGINT"));
  Deno.addSignalListener("SIGTERM", () => shutdown("SIGTERM"));
  // Initialize storage before starting

  yield* until(batcher.init());
  yield* spawn(() => startBatcherHttpServer(batcher, config.port));

  const getPublicConfig = batcher.getPublicConfig();
  console.log(
    `🎯 Batcher started - batching every ${getPublicConfig.batchIntervalSeconds} seconds`,
  );
  console.log(`📍 PaimaL2 Contract: ${getPublicConfig.paimaL2Address}`);
  console.log(`👤 Batcher Address: ${getPublicConfig.batcherAddress}`);
  console.log(`⛓️ Chain: ${getPublicConfig.chainName}`);
  console.log(`📦 Max Batch Size: ${getPublicConfig.maxBatchSize} bytes`);
  console.log(`🏷️ Namespace: "${getPublicConfig.namespace}"`);
  console.log("📋 Press Ctrl+C to stop gracefully");

  // Main batching loop
  yield* batcher.mainLoop();

  console.log("🏁 Batcher main loop has stopped");
}
