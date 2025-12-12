import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  toHex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type BatchedSubunit,
  buildBatchData,
  createMessageForBatcher,
} from "@effectstream/concise";
import { type BatcherStorage, FileStorage } from "./storage.ts";
import { startBatcherHttpServer } from "./batcher-server.ts";
import { type Operation, sleep, spawn, until } from "effection";
import { CryptoManager } from "@effectstream/crypto";
import { AddressType, type EvmAddress, type EvmPrivateKey } from "@effectstream/utils";
import { assertNever } from "assert-never";
import { BuiltinEvents, PaimaEventManager } from "@effectstream/event-client";

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
  paimaL2Address: EvmAddress;
  batcherPrivateKey: EvmPrivateKey;
  chain: Chain;
  batchIntervalMs?: number;
  paimaL2Fee: bigint;
  paimaSyncProtocolName: string;
  namespace?: string;
  maxBatchSize?: number;
  storage?: BatcherStorage; // TODO Probably we want to pass a DB connection instead.
  dataDirectory?: string; // TODO This is only for FileStorage.
  port: number;
}

/**
 * Batcher class.
 * This class is responsible for batching user inputs and submitting them to the PaimaL2 contract.
 */
export class Batcher {
  /* True while the main loop is running */
  private isRunning = false;
  /* True while the batcher is processing a batch */
  private isProcessingBatch = false;
  /* Pending batch interval checks in milliseconds */
  private batchInterval: number;
  /* EVM PaimaL2 contract address */
  private paimaL2Address: EvmAddress;
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
  /* Paima Sync protocol name */
  private paimaSyncProtocolName: string;
  /* Storage for the batcher */
  private storage: BatcherStorage;
  /* Callbacks to return the transaction receipt after the transaction is confirmed */
  private submissionCallbacks: Map<
    string,
    {
      resolve: (transactionReceipt: TransactionReceipt) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor(config: BatcherConfig) {
    this.paimaL2Address = config.paimaL2Address;
    this.paimaSyncProtocolName = config.paimaSyncProtocolName;
    this.batchInterval = config.batchIntervalMs ?? 1000;
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

  private *verifyAndStoreInput(
    batchedSubunit: BatchedSubunit,
  ): Operation<boolean> {
    // Verify the signature
    // TODO 1: We need to setup & configure the namespace.
    // TODO 2: We only support EVM signatures for now.
    //         Should the caller pass the type e.g., EVM of addresses?
    const addressType = batchedSubunit.addressType;
    if (addressType == null) {
      throw new Error(
        "Missing address type: " + JSON.stringify(batchedSubunit),
      );
    }

    const cryptoManager = CryptoManager.getCryptoManager(addressType);
    
    const messageVerified = yield* until(
      cryptoManager.verifySignature(
        batchedSubunit.userAddress,
        createMessageForBatcher(
          null,
          batchedSubunit.millisecondTimestamp,
          batchedSubunit.userAddress,
          batchedSubunit.addressType,
          batchedSubunit.conciseInput,
        ),
        batchedSubunit.userSignature,
      ),
    );

    if (!messageVerified) {
      throw new Error(
        "Invalid signature for " + JSON.stringify(batchedSubunit),
      );
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
   * Add a user input to the batch queue after validating the signature and checking for duplicates
   */
  *addUserInput(
    batchedSubunit: BatchedSubunit,
    waitForConfirmation: "no-wait" | "wait-receipt" | "wait-effectstream-processed" =
      "wait-effectstream-processed",
  ): Operation<TransactionReceipt & { rollup: number } | null> {
    const stored: boolean = yield* this.verifyAndStoreInput(batchedSubunit);

    if (!stored) {
      throw new Error("Failed to verify and store input");
    }

    if (waitForConfirmation === "no-wait") {
      // We don't wait for any confirmation to return to the caller.
      return null;
    }

    const promise = new Promise<TransactionReceipt>(
      (resolve, reject) => {
        this.submissionCallbacks.set(batchedSubunit.userSignature, {
          resolve,
          reject,
        });
      },
    );
    // Wait for the transaction receipt
    const transactionReceipt = yield* until(promise);
    if (!transactionReceipt) {
      throw new Error("Failed to get transaction receipt");
    }

    let rollup = 0;
    // Wait for the transaction to be processed by the Paima Engine
    if (waitForConfirmation === "wait-effectstream-processed") {
      const result = yield* until(this.waitForPaimaProcessed(transactionReceipt));
      if (result) {
        rollup = result.rollup;
      }
    }

    return { ...transactionReceipt, rollup };
  }

  waitForPaimaProcessed(
    transactionReceipt: TransactionReceipt, 
    timeout: number = 60000
  ): Promise<{ latestBlock: number, rollup: number } | void> {
    let subscriptionReference: symbol | undefined = undefined;
    let latestBlock = 0;
    let timer: number | undefined = undefined;
    return Promise.race([
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timeout")), timeout);
      }),
      new Promise<{ latestBlock: number, rollup: number }>((resolve, reject) => {
        PaimaEventManager.Instance.subscribe(
          {
            topic: BuiltinEvents.SyncChains,
            filter: { chain: this.paimaSyncProtocolName, block: undefined },
          },
          (event) => {
            latestBlock = Math.max(event.block, latestBlock);
            if (latestBlock > transactionReceipt.blockNumber) {
              resolve({ latestBlock, rollup: event.rollup });
            }
          },
        )
          .then((subscription) => subscriptionReference = subscription)
          .catch(reject);
      }),
    ]).finally(() => {
      if (subscriptionReference) {
        PaimaEventManager.Instance.unsubscribe(subscriptionReference);
      }
      if (timer) {
        clearTimeout(timer);
      }
    });
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

        for (const input of selectedInputs) {
          const callbacks = this.submissionCallbacks.get(input.userSignature);
          if (callbacks) {
            callbacks.resolve(receipt);
            this.submissionCallbacks.delete(input.userSignature);
          }
        }
      } else {
        console.error(`❌ Batch submission failed! Hash: ${hash}`);
        // Don't remove inputs on failure - they remain in storage for retry
        const error = new Error(`Batch submission failed! Hash: ${hash}`);
        for (const input of selectedInputs) {
          const callbacks = this.submissionCallbacks.get(input.userSignature);
          if (callbacks) {
            callbacks.reject(error);
            this.submissionCallbacks.delete(input.userSignature);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      // On error, inputs remain in storage for retry
      const err = error instanceof Error
        ? error
        : new Error("Unknown error processing batch");
      const pendingInputs = yield* this.storage.getAllInputs();
      for (const input of pendingInputs) {
        const callbacks = this.submissionCallbacks.get(input.userSignature);
        if (callbacks) {
          callbacks.reject(err);
          this.submissionCallbacks.delete(input.userSignature);
        }
      }
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
    batchIntervalMs: number;
    paimaL2Fee: string;
    namespace: string;
    maxBatchSize: number;
    paimaSyncProtocolName: string;
  } {
    return {
      paimaL2Address: this.paimaL2Address,
      batcherAddress: this.account.address,
      chainName: this.walletClient.chain?.name || "Unknown",
      batchIntervalMs: this.batchInterval,
      paimaL2Fee: this.paimaL2Fee.toString(),
      namespace: this.namespace,
      maxBatchSize: this.maxBatchSize,
      paimaSyncProtocolName: this.paimaSyncProtocolName,
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
 * Create and start a new Batcher.
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
    `🎯 Batcher started - batching every ${getPublicConfig.batchIntervalMs} milliseconds`,
  );
  console.log(`📍 PaimaL2 Contract: ${getPublicConfig.paimaL2Address}`);
  console.log(`👤 Batcher Address: ${getPublicConfig.batcherAddress}`);
  console.log(`⛓️ Chain: ${getPublicConfig.chainName}`);
  console.log(`📦 Max Batch Size: ${getPublicConfig.maxBatchSize} bytes`);
  console.log(`🏷️ Namespace: "${getPublicConfig.namespace}"`);
  console.log(
    `🔍 Paima Sync Protocol: "${getPublicConfig.paimaSyncProtocolName}"`,
  );
  console.log("📋 Press Ctrl+C to stop gracefully");

  // Main batching loop
  yield* batcher.mainLoop();

  console.log("🏁 Batcher main loop has stopped");
}
