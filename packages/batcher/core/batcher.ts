import { CryptoManager } from "@paima/crypto";
import { AddressType, TypeboxHelpers } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { call, lift, resource, sleep, spawn, suspend } from "effection";
import type { Operation } from "effection";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { BatchingCriteriaConfig, PaimaBatcherConfig } from "./config.ts";
import {
  applyBatcherConfigDefaults,
  DEFAULT_BATCHING_CRITERIA,
  validateBatcherConfig,
} from "./config.ts";
import { startBatcherHttpServer } from "../server/batcher-server.ts";
import type {
  BatchBuildingResult,
  BatchDataBuilder,
} from "../batch-data-builder/batch-data-builder.ts";
import { DefaultBatchDataBuilder } from "../batch-data-builder/default-batch-builder.ts";
import { BatcherFileStorage } from "./mod.ts";
import { BatchProcessor } from "./batch-processor.ts";
import {
  type BatcherShutdownState,
  type ShutdownHooks,
  ShutdownManager,
} from "./shutdown-manager.ts";
import type { BatcherGrammar, BatcherListener } from "./batcher-events.ts";
import { BuiltinEvents, PaimaEventManager } from "@paima/event-client";

/**
 * PaimaBatcher - A type-safe, simplified blockchain batching system
 *
 * ARCHITECTURE:
 * - Storage is the SINGLE SOURCE OF TRUTH for all data
 * - Batching criteria is configurable via BatchingCriteriaConfig
 * - No in-memory pool - eliminates consistency issues entirely
 * - All operations are atomic and crash-safe
 * - Composed of specialized components for better maintainability
 *
 * COMPONENTS:
 * - BatchProcessor: Handles complex batch processing and transaction lifecycle
 * - ShutdownManager: Coordinates graceful shutdown procedures
 * - Storage: Single source of truth for all batch data
 *
 * BATCHING CRITERIA:
 * - "time": Process based on time windows (e.g., every 5 minutes)
 * - "size": Process based on batch size (e.g., when 100 inputs accumulated)
 * - "value": Process based on accumulated value (e.g., when total value reaches threshold)
 * - "hybrid": Process when either time OR size criteria is met
 * - "custom": Process based on user-defined function
 */

export class PaimaBatcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /** Namespace used for signature verification messages */
  namespace: string = "paima_batcher";
  /** Timer ID for periodic batch processing */
  private pollingIntervalID?: number;
  /** Available blockchain adapters keyed by target name */
  private readonly adapters: Record<string, BlockchainAdapter>;
  /** Default target to use when input.target is not specified */
  public readonly defaultTarget: string;
  /** Per-adapter batching criteria configuration */
  private readonly batchingCriteria: Map<string, BatchingCriteriaConfig<T>>;
  /** Track when the last batch was processed for time-based criteria (per adapter) */
  private lastProcessTime: Map<string, number>;
  /** Track if the batcher is initialized */
  public isInitialized: boolean = false;
  /** HTTP server instance */
  private httpServer?: any;
  /** HTTP server port */
  private readonly port: number;
  /** Whether to enable HTTP server */
  private readonly enableHttpServer: boolean;
  /** Whether to enable event system */
  private readonly enableEventSystem: boolean;
  /** Shutdown state tracking */
  public readonly shutdownState: BatcherShutdownState = {
    isShuttingDown: false,
    shutdownInitiatedAt: null,
    shutdownTimeoutMs: 30000,
    isProcessingBatch: false,
  };
  /** Callbacks to return the transaction receipt after the transaction is confirmed */
  private submissionCallbacks: Map<
    string,
    {
      resolve: (result: BlockchainTransactionReceipt) => void;
      reject: (error: Error) => void;
      timeoutId: number;
    }
  > = new Map();
  /** Batch data builder for constructing batch payloads */
  private readonly batchDataBuilder: BatchDataBuilder<T>;
  /** Batch processor for handling complex batch operations */
  private readonly batchProcessor: BatchProcessor<T>;
  /** Shutdown manager for handling graceful shutdowns */
  private readonly shutdownManager: ShutdownManager<T>;
  /** State transition listeners keyed by prefix */
  private stateTransitionListeners: Map<
    string,
    (payload: any) => void | Promise<void>
  > = new Map();

  /**
   * Create a new PaimaBatcher with type-safe configuration
   *
   * @param config - Type-safe configuration with unified batching criteria
   * @param storage - The storage system for persisting inputs (default: file storage)
   *
   * Runtime validation ensures:
   * - At least one adapter is provided
   * - If defaultTarget is specified, it exists in adapters
   * - Default target falls back to first available adapter if not specified
   */
  public readonly config: PaimaBatcherConfig<
    T,
    Record<string, BlockchainAdapter>
  >;

  constructor(
    config: PaimaBatcherConfig<
      T,
      Record<string, BlockchainAdapter>
    >,
    private readonly storage: BatcherStorage<T> = new BatcherFileStorage<T>(
      "./batcher-data",
    ),
  ) {
    const cfg = applyBatcherConfigDefaults(config);
    this.config = cfg;
    this.adapters = cfg.adapters;
    this.validateConfig();
    this.defaultTarget = cfg.defaultTarget ||
      Object.keys(cfg.adapters)[0];

    // Initialize per-adapter batching criteria
    this.batchingCriteria = new Map();
    for (const target of Object.keys(this.adapters)) {
      const criteria = cfg.batchingCriteria
        ?.[target as keyof typeof cfg.batchingCriteria] ??
        DEFAULT_BATCHING_CRITERIA;
      this.batchingCriteria.set(target, criteria);
    }

    // Initialize per-adapter last process times
    this.lastProcessTime = new Map();
    const now = Date.now();
    for (const target of Object.keys(this.adapters)) {
      this.lastProcessTime.set(target, now);
    }

    this.batchDataBuilder = this.initializeBatchDataBuilder();
    this.batchProcessor = new BatchProcessor<T>({
      buildBatchData: (inputs: T[], target: string) =>
        this.buildBatchData(inputs, target),
      emitStateTransition: async (prefix: string, payload: any) => {
        // For async contexts, we need to handle this differently
        // Since we're in an async method but need to call an Effection operation,
        // we'll create a simple non-blocking implementation
        if (this.enableEventSystem) {
          const listener = this.stateTransitionListeners.get(prefix);
          if (listener) {
            try {
              // Execute the listener asynchronously without blocking
              await listener(payload);
            } catch (error) {
              const hasErrorListener = this.stateTransitionListeners.has(
                "error",
              );
              if (prefix !== "error" && hasErrorListener) {
                try {
                  await this.stateTransitionListeners.get("error")!({
                    phase: `event-listener:${prefix}`,
                    error,
                    time: Date.now(),
                  });
                } catch {
                  // swallow
                }
              }
            }
          }
        }
      },
      storage: this.storage,
      submissionCallbacks: this.submissionCallbacks,
      waitForPaimaProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => this.waitForPaimaProcessed(target, receipt, timeout),
    });
    this.shutdownManager = new ShutdownManager<T>(
      {
        shutdownState: this.shutdownState,
        stopPolling: () => this.stopPolling(),
        stopHttpServer: () => this.stopHttpServer(),
        cleanupResources: () => this.cleanupResources(),
      },
      this,
    );
    this.port = this.config.port!;
    this.enableHttpServer = this.config.enableHttpServer!;
    this.enableEventSystem = this.config.enableEventSystem!;
    this.namespace = this.config.namespace ?? this.namespace;
  }

  /**
   * Register a state transition listener for a given prefix.
   * Throws if a listener already exists for the prefix.
   */
  addStateTransition<Prefix extends keyof BatcherGrammar & string>(
    prefix: Prefix,
    listener: BatcherListener<BatcherGrammar, Prefix>,
  ): void {
    if (this.stateTransitionListeners.has(prefix)) {
      throw new Error(
        `Disallowed: duplicate listener for prefix ${prefix}. Duplicate prefixes can cause determinism issues`,
      );
    }
    this.stateTransitionListeners.set(prefix, listener);
  }

  /** Remove a previously registered state transition listener. */
  removeStateTransition(prefix: string): void {
    this.stateTransitionListeners.delete(prefix);
  }

  /**
   * Emit a state transition event.
   * This runs the listener in a separate, supervised fiber using `spawn`,
   * ensuring that a slow or failing listener does not block the main batcher process.
   */
  *emitStateTransition(prefix: string, payload: any): Operation<void> {
    if (!this.enableEventSystem) return;
    const listener = this.stateTransitionListeners.get(prefix);
    if (!listener) return;

    // `spawn` starts the listener in the background.
    // The `emitStateTransition` operation can return immediately.
    yield* spawn((function* (this: PaimaBatcher<T>) {
      try {
        // We still use `call` here to handle the listener being async.
        yield* lift(listener)(payload);
      } catch (error) {
        // Error handling now happens inside the spawned fiber,
        // preventing a listener crash from taking down the whole batcher.
        const hasErrorListener = this.stateTransitionListeners.has("error");
        if (prefix !== "error" && hasErrorListener) {
          // Re-emit the error, again in a supervised manner.
          yield* lift(this.stateTransitionListeners.get("error")!)({
            phase: `event-listener:${prefix}`,
            error,
            time: Date.now(),
          });
        }
      }
    }).bind(this));
  }

  /**
   * Validate the batcher configuration. Can be overridden by subclasses for custom validation.
   * By default, uses the standard validation from batcher-config.ts
   */
  protected validateConfig(): void {
    validateBatcherConfig(this.config);
  }

  /**
   * Initialize the batch data builder based on configuration
   *
   * @returns The appropriate batch data builder for this batcher
   */
  private initializeBatchDataBuilder(): BatchDataBuilder<T> {
    // Use globally configured default builder, or fallback to our standard implementation
    return this.config.batchBuilding?.defaultBuilder ??
      new DefaultBatchDataBuilder<T>();
  }

  /**
   * Get the appropriate batch data builder for a specific target
   *
   * @param target - The target chain/adapter name
   * @returns The batch data builder for the specified target
   */
  private getBatchDataBuilderForTarget(target: string): BatchDataBuilder<T> {
    // First check for target-specific builder
    const targetBuilders = this.config.batchBuilding?.targetBuilders;
    if (targetBuilders && targetBuilders[target]) {
      return targetBuilders[target];
    }

    // Fallback to default builder
    return this.batchDataBuilder;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    await this.storage.init();
    this.pollingIntervalID = setInterval(
      async () => {
        await this.pollBatcher();
      },
      this.config.pollingIntervalMs,
    );

    // Start HTTP server if enabled
    if (this.enableHttpServer) {
      await this.startHttpServer();
    }

    this.isInitialized = true;
    await this.emitStateTransition("startup", {
      publicConfig: this.getPublicConfig(),
      time: Date.now(),
    });
  }
  /**
   * Add a user input to the batch queue after validating the signature
   * @param input - The input to add to the batch queue
   * @param confirmationLevel - The level of confirmation to wait for
   * @param timeoutMs - Timeout in milliseconds for confirmation (default: 60000)
   * @returns Promise resolving to transaction receipt or null based on confirmation level
   */
  async batchInput(
    input: T,
    confirmationLevel: "no-wait" | "wait-receipt" | "wait-paima-processed" =
      "wait-receipt",
    timeoutMs: number = 60000,
  ): Promise<BlockchainTransactionReceipt & { rollup?: number } | null> {
    if (this.shutdownState.isShuttingDown) {
      throw new Error("Batcher is shutting down, not accepting new inputs");
    }

    const verifiedSignature = await this.verifyInputSignature(input);
    if (!verifiedSignature) {
      throw new Error("Invalid signature");
    }
    await this.addInput(input);
    const { count, size } = await this.storage.getInputCountAndSize();
    console.log(
      `✅ Added input from ${input.address} to batch queue. Queue size: ${count} inputs, ${size} bytes`,
    );

    if (confirmationLevel === "no-wait") {
      return null;
    }

    // Create promise for callback with timeout
    const receiptPromise = new Promise<BlockchainTransactionReceipt>(
      (resolve, reject) => {
        const callbackKey = input.signature || `${input.addressType}-${input.timestamp}`;
        const timeoutId = setTimeout(() => {
          this.submissionCallbacks.delete(callbackKey);
          reject(new Error("Receipt confirmation timeout"));
        }, timeoutMs);
        this.submissionCallbacks.set(callbackKey, {
          resolve: (result) => {
            clearTimeout(timeoutId);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          timeoutId,
        });
      },
    );

    // Wait for transaction receipt
    const receipt = await receiptPromise;

    // If only waiting for receipt, return now
    if (confirmationLevel === "wait-receipt") {
      return receipt;
    }

    // If waiting for Paima processing, continue waiting
    if (confirmationLevel === "wait-paima-processed") {
      try {
        const processingResult = await this.waitForPaimaProcessed(
          input.target || this.defaultTarget,
          receipt,
          timeoutMs,
        );
        if (processingResult) {
          return {
            ...receipt,
            rollup: processingResult.rollup,
          };
        } else {
          throw new Error("Paima processing validation failed");
        }
      } catch (error) {
        throw new Error(
          `Failed to wait for Paima processing: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    return receipt;
  }

  /**
   * Wait for a transaction to be processed by Paima Engine
   * @param receipt - The transaction receipt to wait for
   * @param timeout - Timeout in milliseconds
   * @returns Promise with latest block and rollup number, or null on failure
   */
  private async waitForPaimaProcessed(
    target: string,
    receipt: BlockchainTransactionReceipt,
    timeout: number = 120000,
  ): Promise<{ latestBlock: number; rollup: number } | null> {
    // We need to get the chain name from the receipt
    // Since receipt doesn't have chain info, we need to track which adapter submitted it
    const adapter = this.adapters[target];
    const chainName = adapter.getSyncProtocolName?.() ??
      adapter.getChainName();

    let subscriptionReference: symbol | undefined = undefined;
    let latestBlock = 0;
    let timer: number | undefined = undefined;

    try {
      const result = await Promise.race([
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Timeout")), timeout);
        }),
        new Promise<{ latestBlock: number; rollup: number }>(
          (resolve, reject) => {
            PaimaEventManager.Instance.subscribe(
              {
                topic: BuiltinEvents.SyncChains,
                filter: { chain: chainName, block: undefined },
              },
              (event) => {
                latestBlock = Math.max(event.block, latestBlock);
                if (latestBlock > Number(receipt.blockNumber)) {
                  resolve({ latestBlock, rollup: event.rollup });
                }
              },
            )
              .then((subscription) => subscriptionReference = subscription)
              .catch(reject);
          },
        ),
      ]);
      return result || null;
    } catch (error) {
      console.error("Error waiting for Paima processing:", error);
      return null;
    } finally {
      if (subscriptionReference) {
        PaimaEventManager.Instance.unsubscribe(subscriptionReference);
      }
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Add input to storage
   * Storage is the single source of truth - no pool needed
   */
  async addInput(input: T): Promise<void> {
    await this.storage.addInput(input);
  }

  async verifyInputSignature(
    input: T,
  ): Promise<boolean> {
    if (input.addressType === AddressType.MIDNIGHT) {
      return true;
    }

    const message = this.createSignatureMessage(input);
    // TODO: Define a generic signature verifier for all the supported address types.
    return await CryptoManager.Evm().verifySignature(
      input.address,
      message,
      input.signature,
    );
  }

  async pollBatcher(): Promise<void> {
    if (this.shutdownState.isShuttingDown) return;

    // Check each adapter target independently for batching readiness
    const targetsToProcess: string[] = [];
    for (const target of Object.keys(this.adapters)) {
      if (await this.isTargetReadyForBatching(target)) {
        targetsToProcess.push(target);
      }
    }

    if (targetsToProcess.length === 0) return;
    await this.emitStateTransition("poll:targets-ready", {
      targets: targetsToProcess,
      time: Date.now(),
    });

    // Process batches for ready targets
    await this.processBatchesForTargets(targetsToProcess);

    // Update last process times for processed targets
    const now = Date.now();
    for (const target of targetsToProcess) {
      this.lastProcessTime.set(target, now);
    }
  }

  /**
   * Check if a specific target is ready for batching based on its configured criteria
   */
  private async isTargetReadyForBatching(target: string): Promise<boolean> {
    const targetInputs = await this.storage.getInputsByTarget(
      target,
      this.defaultTarget,
    );

    // If no inputs for this target, nothing is ready
    if (!targetInputs.length) return false;

    const criteria = this.batchingCriteria.get(target)!;
    const { criteriaType } = criteria;

    switch (criteriaType) {
      case "time":
        return this.checkTimeCriteriaForTarget(target);
      case "size":
        return this.checkSizeCriteriaForTarget(targetInputs, criteria);
      case "value":
        return this.checkValueCriteriaForTarget(targetInputs, criteria);
      case "hybrid":
        return this.checkHybridCriteriaForTarget(
          target,
          targetInputs,
          criteria,
        );
      case "custom":
        return this.checkCustomCriteriaForTarget(
          target,
          targetInputs,
          criteria,
        );
      default:
        console.warn(
          `Unknown criteria type for target ${target}: ${criteriaType}`,
        );
        return false;
    }
  }

  /**
   * Check if time-based criteria is met for a specific target
   */
  private checkTimeCriteriaForTarget(target: string): boolean {
    const criteria = this.batchingCriteria.get(target)!;
    const timeSinceLastProcess = Date.now() - this.lastProcessTime.get(target)!;
    return timeSinceLastProcess >= criteria.timeWindowMs!;
  }

  /**
   * Check if size-based criteria is met for a specific target
   */
  private checkSizeCriteriaForTarget(
    targetInputs: T[],
    criteria: BatchingCriteriaConfig<T>,
  ): boolean {
    return targetInputs.length >= criteria.maxBatchSize!;
  }

  /**
   * Check if value-based criteria is met
   */
  private checkValueCriteriaForTarget(
    targetInputs: T[],
    criteria: BatchingCriteriaConfig<T>,
  ): boolean {
    if (!criteria.valueAccumulatorFn || !criteria.targetValue) {
      return false;
    }

    const totalValue = targetInputs.reduce((sum, input) => {
      return sum + criteria.valueAccumulatorFn!(input as T);
    }, 0);
    return totalValue >= criteria.targetValue;
  }

  /**
   * Check if hybrid (time + size) criteria is met for a specific target
   */
  private checkHybridCriteriaForTarget(
    target: string,
    targetInputs: T[],
    criteria: BatchingCriteriaConfig<T>,
  ): boolean {
    const timeReady = this.checkTimeCriteriaForTarget(target);
    const sizeReady = this.checkSizeCriteriaForTarget(targetInputs, criteria);
    return timeReady || sizeReady;
  }

  /**
   * Check if custom criteria is met for a specific target
   */
  private async checkCustomCriteriaForTarget(
    target: string,
    targetInputs: T[],
    criteria: BatchingCriteriaConfig<T>,
  ): Promise<boolean> {
    if (!criteria.isBatchReadyFn) {
      return false;
    }
    try {
      return await criteria.isBatchReadyFn(
        targetInputs as T[],
        this.lastProcessTime.get(target)!,
      );
    } catch (error) {
      console.error(
        `❌ Error in custom batch criteria function for target ${target}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Force process current batch (useful for testing or manual triggers)
   */
  async forceProcessBatches(): Promise<void> {
    if (this.shutdownState.isShuttingDown) {
      throw new Error("Cannot force process batches during shutdown");
    }

    console.log("🔧 Force processing batches for all targets...");
    const allTargets = Object.keys(this.adapters);
    await this.processBatchesForTargets(allTargets);

    // Update last process times for all targets
    const now = Date.now();
    for (const target of allTargets) {
      this.lastProcessTime.set(target, now);
    }
  }

  /**
   * Clear all pending inputs (useful for testing)
   */
  async clearPendingInputs(): Promise<void> {
    if (this.shutdownState.isShuttingDown) {
      throw new Error("Cannot clear pending inputs during shutdown");
    }

    await this.storage.clearAllInputs();
  }

  /**
   * Start the HTTP server for the batcher
   * This provides REST API endpoints for interacting with the batcher
   */
  async startHttpServer(): Promise<void> {
    if (this.httpServer) {
      console.log("⚠️ HTTP server already running");
      return;
    }

    try {
      this.httpServer = await startBatcherHttpServer(this, this.port);
      await this.emitStateTransition("http:start", {
        port: this.port,
        time: Date.now(),
      });
    } catch (error) {
      console.error("❌ Failed to start HTTP server:", error);
      throw error;
    }
  }

  /**
   * Stop the HTTP server
   */
  async stopHttpServer(): Promise<void> {
    if (this.httpServer) {
      await this.httpServer.close();
      this.httpServer = undefined;
      await this.emitStateTransition("http:stop", { time: Date.now() });
    }
  }

  /**
   * Get current batching status and statistics
   */
  async getBatchingStatus(): Promise<{
    targets: Array<{
      target: string;
      isReady: boolean;
      pendingInputs: number;
      criteriaType: string;
      timeSinceLastProcess: number;
    }>;
    totalPendingInputs: number;
    adapterTargets: string[];
  }> {
    const adapterTargets = Object.keys(this.adapters);
    const targets: Array<{
      target: string;
      isReady: boolean;
      pendingInputs: number;
      criteriaType: string;
      timeSinceLastProcess: number;
    }> = [];

    let totalPendingInputs = 0;

    for (const target of adapterTargets) {
      const targetInputs = await this.storage.getInputsByTarget(
        target,
        this.defaultTarget,
      );
      const isReady = await this.isTargetReadyForBatching(target);
      const timeSinceLastProcess = Date.now() -
        this.lastProcessTime.get(target)!;
      const criteria = this.batchingCriteria.get(target)!;

      targets.push({
        target,
        isReady,
        pendingInputs: targetInputs.length,
        criteriaType: criteria.criteriaType,
        timeSinceLastProcess,
      });

      totalPendingInputs += targetInputs.length;
    }

    return {
      targets,
      totalPendingInputs,
      adapterTargets,
    };
  }

  /**
   * Get shutdown status information
   */
  getShutdownStatus() {
    return this.shutdownManager.getShutdownStatus();
  }

  /**
   * Get public configuration information (safe for external exposure)
   */
  getPublicConfig(): {
    pollingIntervalMs: number;
    defaultTarget: string;
    enableHttpServer: boolean;
    enableEventSystem: boolean;
    confirmationLevel: string | Partial<Record<string, string>>;
    port: number;
    adapterTargets: string[];
    /** Per-adapter batching criteria types */
    criteriaTypes: Record<string, string>;
  } {
    const criteriaTypes: Record<string, string> = {};
    for (const [target, criteria] of this.batchingCriteria) {
      criteriaTypes[target] = criteria.criteriaType;
    }

    return {
      pollingIntervalMs: this.config.pollingIntervalMs,
      defaultTarget: this.defaultTarget,
      enableHttpServer: this.enableHttpServer,
      enableEventSystem: this.enableEventSystem,
      confirmationLevel: this.config.confirmationLevel || "undefined",
      port: this.port,
      adapterTargets: Object.keys(this.adapters),
      criteriaTypes,
    };
  }

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   * Effection-compatible version that can be used with yield*
   */
  *gracefulShutdownOp(
    hooks?: ShutdownHooks<any>,
    options?: { timeoutMs?: number; force?: boolean },
  ): Operation<void> {
    yield* this.shutdownManager.gracefulShutdownOp(hooks, options);
  }

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   * Legacy async version for backward compatibility
   */
  gracefulShutdown(
    hooks?: ShutdownHooks<any>,
    options?: { timeoutMs?: number; force?: boolean },
  ): Promise<void> {
    return this.shutdownManager.gracefulShutdown(hooks, options);
  }

  /**
   * Stop the polling interval
   */
  private stopPolling(): void {
    if (this.pollingIntervalID) {
      clearInterval(this.pollingIntervalID);
      this.pollingIntervalID = undefined;
    }
  }

  /**
   * Cleanup additional resources (can be overridden by subclasses)
   */
  protected async cleanupResources(): Promise<void> {
    // Default implementation - can be extended by subclasses
  }

  /**
   * Process and submit batches using the appropriate blockchain adapters
   * This method handles the core batch processing logic including:
   * - Grouping inputs by target/adapter
   * - Building optimized batch data
   * - Submitting to appropriate blockchain via adapters
   * - Handling confirmations and callbacks
   */
  async processBatches(): Promise<void> {
    if (this.shutdownState.isShuttingDown) return;

    const pendingInputs = await this.storage.getAllInputs();

    if (pendingInputs.length === 0) {
      console.log("📭 No pending inputs to process");
      return;
    }

    console.log(`🚀 Processing ${pendingInputs.length} pending inputs...`);

    this.shutdownState.isProcessingBatch = true;

    try {
      // Group inputs by target (adapter)
      const inputsByTarget = new Map<string, T[]>();

      for (const input of pendingInputs) {
        const target = input.target || this.defaultTarget;
        if (!inputsByTarget.has(target)) {
          inputsByTarget.set(target, []);
        }
        inputsByTarget.get(target)!.push(input);
      }

      for (const [target, inputs] of inputsByTarget) {
        const adapter = this.adapters[target];
        if (!adapter) {
          console.error(`❌ No adapter available for target: ${target}`);
          continue;
        }

        try {
          await this.batchProcessor.processBatchForTarget(
            adapter,
            target,
            inputs,
          );
        } catch (error) {
          console.error(
            `❌ Error processing batch for target ${target}:`,
            error,
          );
          // Continue processing other targets even if one fails
        }
      }
    } finally {
      this.shutdownState.isProcessingBatch = false;
    }
  }

  /**
   * Process batches for specific targets
   * @param targetsToProcess - Array of target names to process batches for
   */
  async processBatchesForTargets(targetsToProcess: string[]): Promise<void> {
    if (this.shutdownState.isShuttingDown) return;

    if (targetsToProcess.length === 0) {
      return;
    }

    this.shutdownState.isProcessingBatch = true;

    try {
      for (const target of targetsToProcess) {
        const adapter = this.adapters[target];
        if (!adapter) {
          console.error(`❌ No adapter available for target: ${target}`);
          continue;
        }

        // Get inputs for this specific target
        const targetInputs = await this.storage.getInputsByTarget(
          target,
          this.defaultTarget,
        );

        if (targetInputs.length === 0) {
          continue;
        }

        try {
          await this.emitStateTransition("batch:process:start", {
            target,
            inputCount: targetInputs.length,
            time: Date.now(),
          });
          await this.batchProcessor.processBatchForTarget(
            adapter,
            target,
            targetInputs,
          );
        } catch (error) {
          console.error(
            `❌ Error processing batch for target ${target}:`,
            error,
          );
          await this.emitStateTransition("error", {
            phase: "batch",
            target,
            error,
            time: Date.now(),
          });
          // Continue processing other targets even if one fails
        }
      }
    } finally {
      this.shutdownState.isProcessingBatch = false;
    }
  }

  /**
   * Build optimized batch data from inputs
   * TODO: This should use the actual buildBatchData utility from @paima/concise
   */
  private buildBatchData(
    inputs: T[],
    target: string,
  ): BatchBuildingResult<T> | null {
    const builder = this.getBatchDataBuilderForTarget(target);
    const adapter = this.adapters[target];
    const options = {
      maxSize: adapter.maxBatchSize ?? this.config.batchBuilding?.maxSize,
      target: target,
    };

    return builder.buildBatchData(inputs, options);
  }
  /**
   * Validate the input and return a boolean indicating if the input is valid.
   * Default is a placeholder to be overridden by the user extending the PaimaBatcher class.
   * @param input - The input to validate.
   * @returns A boolean or Promise<boolean> in the case is implemented as async indicating if the input is valid.
   */
  validateInput(input: T): boolean | Promise<boolean> {
    return !!input.signature && !!input.address;
  }

  /**
   * Creates the message to be validated by verifyInputSignature against a signature and address.
   * @param input - The input to create a message for.
   * @returns A string message for the batcher.
   */
  private createSignatureMessage(input: T): string {
    let walletAddress;
    switch (input.addressType) {
      case AddressType.EVM:
        walletAddress = Value.Decode(TypeboxHelpers.Evm.Address, input.address);
        break;
      default:
        throw new Error("Invalid address type");
    }
    return (
      this.namespace +
      (input.target ?? "") +
      input.timestamp +
      walletAddress +
      input.input
    )
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLocaleLowerCase();
  }

  /**
   * It starts the server and holds it until the operation is halted,
   * at which point it automatically stops the server.
   */
  *runHttpServer(): Operation<void> {
    if (!this.enableHttpServer) {
      return;
    }

    yield* resource(
      (function* (this: PaimaBatcher<T>, provide: (value: any) => void) {
        const server = yield* call(() => this.startHttpServer());
        provide(server);
        yield* suspend(); // Keep the server alive until cancelled
      }).bind(this),
    );
  }

  /**
   * An Effection operation that runs the polling loop indefinitely.
   * This operation is intended to be spawned as a background task that
   * is automatically cancelled when its parent scope terminates.
   */
  *runPollingLoop(): Operation<void> {
    while (true) {
      yield* sleep(this.config.pollingIntervalMs);
      yield* call(() => this.pollBatcher());
    }
  }

  /**
   * Run the batcher using Effection structured concurrency.
   * This operation initializes the batcher and then runs the HTTP server
   * and polling loop as concurrent, managed background tasks.
   *
   * @returns An Effection operation that runs the batcher.
   */
  *runBatcher(): Operation<void> {
    // 1. Perform sequential setup tasks
    yield* call(() => this.storage.init());
    this.isInitialized = true;
    yield* this.emitStateTransition("startup", {
      publicConfig: this.getPublicConfig(),
      time: Date.now(),
    });

    // 2. Run the main background tasks concurrently
    // Spawn ensures that if one task fails or stops, the other is also stopped.
    // This is the essence of structured concurrency.
    yield* spawn(() => this.runHttpServer());
    yield* spawn(() => this.runPollingLoop());
  }
}

/**
 * Signal handler for graceful shutdown
 */
class SignalHandler {
  private listeners: (() => void)[] = [];

  /**
   * Setup signal listeners for graceful shutdown
   */
  setup(
    shutdownFn: () => Promise<void>,
    config: {
      signals?: string[];
      customShutdownHandler?: (signal: string) => Promise<void> | void;
      exitCode?: number;
    } = {},
  ): void {
    const signals = config.signals || ["SIGINT", "SIGTERM"];

    for (const signal of signals) {
      const listener = async () => {
        console.log(`🛑 Received ${signal}, initiating graceful shutdown...`);

        try {
          if (config.customShutdownHandler) {
            await config.customShutdownHandler(signal);
          } else {
            await shutdownFn();
          }
        } catch (error) {
          console.error(`❌ Error during shutdown on ${signal}:`, error);
        } finally {
          Deno.exit(config.exitCode || 0);
        }
      };

      Deno.addSignalListener(signal as Deno.Signal, listener);
      this.listeners.push(listener);
    }
  }

  /**
   * Cleanup signal listeners
   */
  cleanup(): void {
    // Deno doesn't provide removeSignalListener, so we rely on process exit
    this.listeners.length = 0;
  }
}

/**
 * Create and launch a new Batcher with optional signal handling
 */
export async function createAndLaunchBatcher<T extends DefaultBatcherInput>(
  storage: BatcherStorage<T>,
  config: PaimaBatcherConfig<T>,
): Promise<void> {
  const batcher = new PaimaBatcher(config, storage);
  await batcher.init();

  // Setup signal handling if configured
  let signalHandler: SignalHandler | undefined;
  if (config.shutdown?.signalHandling) {
    signalHandler = new SignalHandler();
    signalHandler.setup(
      () =>
        batcher.gracefulShutdown(
          config.shutdown!.hooks,
          {
            timeoutMs: config.shutdown!.timeoutMs,
          },
        ),
      config.shutdown.signalHandling,
    );
  }

  // Log startup information
  const publicConfig = batcher.getPublicConfig();
  console.log(
    `🎯 Batcher started - polling every ${publicConfig.pollingIntervalMs} milliseconds`,
  );
  console.log(`📍 Default Target: ${publicConfig.defaultTarget}`);
  console.log(
    `⛓️ Adapter Targets: ${publicConfig.adapterTargets.join(", ")}`,
  );
  console.log(
    `📦 Batching Criteria: ${
      Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
        `${target}=${type}`
      ).join(", ")
    }`,
  );
  if (publicConfig.enableHttpServer) {
    console.log(`🌐 HTTP Server: http://localhost:${publicConfig.port}`);
  }
  console.log("📋 Press Ctrl+C to stop gracefully");

  // Keep process alive (batcher runs via polling)
  // The process will exit when signals are received
  await new Promise(() => {}); // Never resolves, waits for signals
}
