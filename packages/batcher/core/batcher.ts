import { CryptoManager } from "@effectstream/crypto";
import { call, lift, resource, sleep, spawn, suspend } from "effection";
import type { Operation } from "effection";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { BatchingCriteriaConfig, BatcherConfig } from "./config.ts";
import {
  applyBatcherConfigDefaults,
  DEFAULT_BATCHING_CRITERIA,
  validateBatcherConfig,
  validateBatchingCriteria,
  validatePreInit,
} from "./config.ts";
import { startBatcherHttpServer } from "../server/batcher-server.ts";
import { BatcherFileStorage } from "./mod.ts";
import { BatchProcessor } from "./batch-processor.ts";
import {
  type BatcherShutdownState,
  type ShutdownHooks,
  ShutdownManager,
} from "./shutdown-manager.ts";
import type { BatcherGrammar, BatcherListener } from "./batcher-events.ts";
import { BuiltinEvents, PaimaEventManager as EffectStreamEventManager } from "@effectstream/event-client";

/**
 * Custom error class for input validation failures
 * Provides structured error information with appropriate HTTP status codes
 */
export class InputValidationError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = "InputValidationError";
  }
}

/**
 * EffectStream Batcher - A type-safe, simplified blockchain batching system
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

export class Batcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /** Namespace used for signature verification messages */
  namespace: string = "effectstream_batcher";
  /** Timer ID for periodic batch processing */
  private pollingIntervalID?: number;
  /** Available blockchain adapters keyed by target name */
  private adapters: Record<string, BlockchainAdapter<any>>;
  /** Default target to use when input.target is not specified */
  public defaultTarget?: string;
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
    processingAdapters: new Set<string>(),
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
   * Create a new Batcher with type-safe configuration
   *
   * @param config - Type-safe configuration with unified batching criteria
   * @param storage - The storage system for persisting inputs (default: file storage)
   *
   * Runtime validation ensures:
   * - At least one adapter is provided
   * - If defaultTarget is specified, it exists in adapters
   * - Default target falls back to first available adapter if not specified
   */
  public readonly config: BatcherConfig<
    T,
    Record<string, BlockchainAdapter<any>>
  >;

  constructor(
    config: BatcherConfig<
      T,
      Record<string, BlockchainAdapter<any>>
    >,
    private readonly storage: BatcherStorage<T> = new BatcherFileStorage<T>(
      "./batcher-data",
    ),
  ) {
    const cfg = applyBatcherConfigDefaults(config);
    this.config = cfg;
    this.adapters = cfg.adapters || {};
    this.validateConfig();
    
    // Resolve defaultTarget: if adapters exist in config, auto-set to first adapter if not specified
    // If no adapters in config, defer until first adapter is added via addBlockchainAdapter()
    if (Object.keys(this.adapters).length > 0) {
      // Auto-set to first adapter if defaultTarget not explicitly provided
      this.defaultTarget = cfg.defaultTarget ||
        Object.keys(this.adapters)[0];
      if (!cfg.defaultTarget) {
        console.log(
          `🎯 Auto-set default target to '${this.defaultTarget}' (first adapter from config)`,
        );
      }
    } else {
      // No adapters in config - will be set when first adapter is added via addBlockchainAdapter()
      this.defaultTarget = cfg.defaultTarget;
    }

    // Initialize per-adapter batching criteria
    this.batchingCriteria = new Map();
    for (const target of Object.keys(this.adapters)) {
      const criteria = cfg.batchingCriteria
        ?.[target as keyof typeof cfg.batchingCriteria] ??
        DEFAULT_BATCHING_CRITERIA;
      this.batchingCriteria.set(target, criteria);
    }

    // Initialize last process times map (will be populated in init()/runBatcher())
    this.lastProcessTime = new Map();

    this.batchProcessor = new BatchProcessor<T>({
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
      getCallbackKey: (input: T) => this.getInputCallbackKey(input),
      waitForEffectStreamProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => this.waitForEffectStreamProcessed(target, receipt, timeout),
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
  ): Batcher<T> {
    if (this.stateTransitionListeners.has(prefix)) {
      throw new Error(
        `Disallowed: duplicate listener for prefix ${prefix}. Duplicate prefixes can cause determinism issues`,
      );
    }
    this.stateTransitionListeners.set(prefix, listener);
    return this;
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
    yield* spawn((function* (this: Batcher<T>) {
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
   * Add a blockchain adapter dynamically before batcher startup.
   * Must be called before runBatcher() or init().
   *
   * @param name - Unique name for the adapter (e.g., "ethereum", "midnight")
   * @param adapter - The blockchain adapter instance
   * @param batchingCriteria - Optional batching criteria for this adapter. If not provided, uses DEFAULT_BATCHING_CRITERIA
   * @throws If batcher is already initialized
   * @throws If adapter name already exists
   * @throws If batching criteria is invalid
   */
  addBlockchainAdapter<TOutput>(
    name: string,
    adapter: BlockchainAdapter<TOutput>,
    batchingCriteria?: BatchingCriteriaConfig<T>,
  ): Batcher<T> {
    if (this.isInitialized) {
      throw new Error(
        "Cannot add adapters after batcher has been initialized. " +
          "Call addBlockchainAdapter() before init() or runBatcher().",
      );
    }

    if (name in this.adapters) {
      throw new Error(
        `Adapter with name '${name}' already exists. Available adapters: ${
          Object.keys(this.adapters).join(", ")
        }`,
      );
    }

    this.adapters[name] = adapter;

    // Resolve batching criteria (provided > default > global default)
    const criteria = batchingCriteria ?? DEFAULT_BATCHING_CRITERIA;
    validateBatchingCriteria(criteria);
    this.batchingCriteria.set(name, criteria);

    if (!this.defaultTarget) {
      this.defaultTarget = name;
      console.log(`🎯 Auto-set default target to '${name}' (first adapter)`);
    }

    if (!this.config.batchingCriteria) {
      this.config.batchingCriteria = {};
    }
    (this.config.batchingCriteria as any)[name] = criteria;
    return this;
  }

  /**
   * Update batching criteria for an adapter before startup.
   * Must be called before runBatcher() or init().
   *
   * @param adapterName - Name of the adapter to update
   * @param criteria - New batching criteria configuration
   * @throws If batcher is already initialized
   * @throws If adapter doesn't exist
   * @throws If batching criteria is invalid
   */
  setBatchingCriteria(
    adapterName: string,
    criteria: BatchingCriteriaConfig<T>,
  ): Batcher<T> {
    if (this.isInitialized) {
      throw new Error(
        "Cannot modify batching criteria after batcher has been initialized.",
      );
    }

    if (!(adapterName in this.adapters)) {
      throw new Error(
        `Adapter '${adapterName}' not found. Available adapters: ${
          Object.keys(this.adapters).join(", ")
        }`,
      );
    }

    validateBatchingCriteria(criteria);
    this.batchingCriteria.set(adapterName, criteria);

    if (!this.config.batchingCriteria) {
      this.config.batchingCriteria = {};
    }
    (this.config.batchingCriteria as any)[adapterName] = criteria;

    return this;
  }

  /**
   * Set the default target adapter before startup.
   * Must be called before runBatcher() or init().
   *
   * @param adapterName - Name of the adapter to set as default target
   * @throws If batcher is already initialized
   * @throws If adapter doesn't exist
   */
  setDefaultTarget(adapterName: string): Batcher<T> {
    if (this.isInitialized) {
      throw new Error(
        "Cannot modify default target after batcher has been initialized.",
      );
    }

    if (!(adapterName in this.adapters)) {
      throw new Error(
        `Adapter '${adapterName}' not found. Available adapters: ${
          Object.keys(this.adapters).join(", ")
        }`,
      );
    }

    this.defaultTarget = adapterName;
    return this;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    validatePreInit(this.adapters, this.defaultTarget);

    const now = Date.now();
    for (const target of Object.keys(this.adapters)) {
      this.lastProcessTime.set(target, now);
    }

    await this.storage.init();

    for (const [target, adapter] of Object.entries(this.adapters)) {
      if (typeof adapter.recoverState === "function") {
        const pendingInputs = await this.storage.getInputsByTarget(
          target,
          this.defaultTarget!, // defaultTarget is guaranteed to be set at this point
        );
        await adapter.recoverState(pendingInputs);
      }
    }

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
    confirmationLevel: "no-wait" | "wait-receipt" | "wait-effectstream-processed" =
      "wait-receipt",
    timeoutMs: number = 60000,
  ): Promise<BlockchainTransactionReceipt & { rollup?: number } | null> {
    if (this.shutdownState.isShuttingDown) {
      // 503 Service Unavailable
      throw new InputValidationError(
        "Batcher is shutting down, not accepting new inputs",
        503,
      );
    }

    if (!this.defaultTarget && !input.target) {
      throw new InputValidationError(
        "No default target configured and input.target not specified. " +
          "Add adapters using addBlockchainAdapter() before initialization.",
        400,
      );
    }

    const target = input.target || this.defaultTarget!;
    const adapter = this.adapters[target];
    if (!adapter) {
      throw new InputValidationError(`Adapter for target ${target} not found. Available targets: ${Object.keys(this.adapters).join(", ")}`, 404);
    }

    // 1. Signature Validation (Pre-Queue, Adapter-Driven)
    let verifiedSignature: boolean;

    if (adapter && typeof adapter.verifySignature === "function") {
      verifiedSignature = await adapter.verifySignature(input);
    } else if (input.signature) {
      // Fall back to the batcher's default EVM verification when a signature is provided
      verifiedSignature = await this._defaultVerifyInputSignature(input);
    } else {
      throw new InputValidationError(
        `Adapter for target ${target} requires either a signature or a custom verifySignature implementation`,
      );
    }

    if (!verifiedSignature) {
      throw new InputValidationError("Invalid signature", 401);
    }

    // 2. Adapter-Specific Input Validation (Pre-Queue)
    if (adapter && typeof adapter.validateInput === "function") {
      const validationResult = await adapter.validateInput(input);
      if (!validationResult.valid) {
        throw new InputValidationError(
          validationResult.error || "Invalid input for target adapter",
        );
      }
    }

    // 3. Add to Storage (Only if all validation passes)
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
        const callbackKey = this.getInputCallbackKey(input);
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

    // If waiting for EffectStream processing, continue waiting
    if (confirmationLevel === "wait-effectstream-processed") {
      const target = input.target || this.defaultTarget;
      if (!target) {
        throw new Error(
          "Cannot wait for EffectStream processing: no target specified and no default target configured.",
        );
      }
      try {
        const processingResult = await this.waitForEffectStreamProcessed(
          target,
          receipt,
          timeoutMs,
        );
        if (processingResult) {
          return {
            ...receipt,
            rollup: processingResult.rollup,
          };
        } else {
          throw new Error("EffectStream processing validation failed");
        }
      } catch (error) {
        throw new Error(
          `Failed to wait for EffectStream processing: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    return receipt;
  }

  /**
   * Wait for a transaction to be processed by EffectStream
   * @param receipt - The transaction receipt to wait for
   * @param timeout - Timeout in milliseconds
   * @returns Promise with latest block and rollup number, or null on failure
   */
  private async waitForEffectStreamProcessed(
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
            EffectStreamEventManager.Instance.subscribe(
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
      console.error("Error waiting for EffectStream processing:", error);
      return null;
    } finally {
      if (subscriptionReference) {
        EffectStreamEventManager.Instance.unsubscribe(subscriptionReference);
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
    const target = input.target ?? this.defaultTarget;
    if (!target) {
      throw new Error(
        "Cannot add input: no target specified and no default target configured.",
      );
    }
    await this.storage.addInput(input, target);
  }

  private async _defaultVerifyInputSignature(
    input: T,
  ): Promise<boolean> {
    // This is the default EVM verification logic
    // Create the signature message using EVM-specific logic
    if (!input.signature) {
      throw new Error(
        "Default signature verification requires a signature to be provided",
      );
    }

    let walletAddress;

    const cryptoManager = CryptoManager.getCryptoManager(input.addressType);
    walletAddress = cryptoManager.decodeAddress(input.address);

    const message = (
      this.namespace +
      (input.target ?? "") +
      input.timestamp +
      walletAddress +
      input.input
    )
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLocaleLowerCase();
    return await cryptoManager.verifySignature(input.address, message, input.signature);
  }

  private getInputCallbackKey(input: T): string {
    const target = input.target || this.defaultTarget;
    if (!target) {
      throw new Error(
        "Cannot generate callback key: no target specified and no default target configured.",
      );
    }
    return [
      input.addressType,
      target,
      input.address,
      input.timestamp,
      input.signature ?? "",
      input.input,
    ].join("|");
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
    if (!this.defaultTarget) {
      // This shouldn't happen after init(), but handle gracefully
      return false;
    }
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

    if (!this.defaultTarget) {
      return {
        targets: [],
        totalPendingInputs: 0,
        adapterTargets: [],
      };
    }

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
    defaultTarget: string | undefined;
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

    // Group inputs by target (adapter)
    const inputsByTarget = new Map<string, T[]>();

    for (const input of pendingInputs) {
      const target = input.target || this.defaultTarget;
      if (!target) {
        console.error(
          `❌ Skipping input: no target specified and no default target configured.`,
        );
        continue;
      }
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

      // Mark target as processing when it enters
      this.shutdownState.processingAdapters.add(target);
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
      } finally {
        // Remove target from processing when it finishes
        this.shutdownState.processingAdapters.delete(target);
      }
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

    for (const target of targetsToProcess) {
      const adapter = this.adapters[target];
      if (!adapter) {
        console.error(`❌ No adapter available for target: ${target}`);
        continue;
      }

      // Get inputs for this specific target
      if (!this.defaultTarget) {
        console.error(
          `❌ Cannot process batches: no default target configured.`,
        );
        continue;
      }
      const targetInputs = await this.storage.getInputsByTarget(
        target,
        this.defaultTarget,
      );

      if (targetInputs.length === 0) {
        continue;
      }

      // Mark target as processing when it enters
      this.shutdownState.processingAdapters.add(target);
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
      } finally {
        // Remove target from processing when it finishes
        this.shutdownState.processingAdapters.delete(target);
      }
    }
  }

  /**
   * Validate the input and return a boolean indicating if the input is valid.
   * Default is a placeholder to be overridden by the user extending the Batcher class.
   * @param input - The input to validate.
   * @returns A boolean or Promise<boolean> in the case is implemented as async indicating if the input is valid.
   */
  validateInput(input: T): boolean | Promise<boolean> {
    return !!input.address;
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
      (function* (this: Batcher<T>, provide: (value: any) => void) {
        const server = yield* call(() => this.startHttpServer());
        provide(server);
        yield* suspend(); // Keep the server alive until cancelled
      }).bind(this),
    );
  }

  /**
   * An Effection operation that runs the polling loop for a specific adapter target.
   * Each adapter gets its own independent polling loop, eliminating cross-adapter blocking.
   * 
   * @param target - The adapter target name to poll for
   */
  *runAdapterPollingLoop(target: string): Operation<void> {
    while (true) {
      yield* sleep(this.config.pollingIntervalMs);

      if (this.shutdownState.isShuttingDown) return;

      const isReady = yield* call(() => this.isTargetReadyForBatching(target));
      if (!isReady) continue;

      this.shutdownState.processingAdapters.add(target);

      try {
        const targetInputs = yield* call(() =>
          this.storage.getInputsByTarget(target, this.defaultTarget!)
        );

        if (targetInputs.length > 0) {
          yield* this.emitStateTransition("batch:process:start", {
            target,
            inputCount: targetInputs.length,
            time: Date.now(),
          });

          const adapter = this.adapters[target];
          yield* call(() =>
            this.batchProcessor.processBatchForTarget(
              adapter,
              target,
              targetInputs
            )
          );
        }

        this.lastProcessTime.set(target, Date.now());
      } catch (error) {
        console.error(`❌ Error processing batch for target ${target}:`, error);
        yield* this.emitStateTransition("error", {
          phase: "batch",
          target,
          error,
          time: Date.now(),
        });
      } finally {
        this.shutdownState.processingAdapters.delete(target);
      }
    }
  }

  /**
   * An Effection operation that runs independent polling loops for each adapter.
   * This operation spawns a separate polling loop for each adapter target,
   * ensuring that slow adapters don't block fast ones.
   */
  *runPollingLoop(): Operation<void> {
    for (const target of Object.keys(this.adapters)) {
      yield* spawn(() => this.runAdapterPollingLoop(target));
    }
    yield* suspend(); // Keep alive while spawned tasks run
  }

  /**
   * Run the batcher using Effection structured concurrency.
   * This operation initializes the batcher and then runs the HTTP server
   * and polling loop as concurrent, managed background tasks.
   *
   * @returns An Effection operation that runs the batcher.
   */
  *runBatcher(): Operation<void> {
    // 1. Validate adapters before initialization
    validatePreInit(this.adapters, this.defaultTarget);

    // 2. Initialize last process times for all adapters at startup
    const now = Date.now();
    for (const target of Object.keys(this.adapters)) {
      this.lastProcessTime.set(target, now);
    }

    // 3. Perform sequential setup tasks
    yield* call(() => this.storage.init());

    // 4. Recover adapter state from storage (e.g., Bitcoin reserved funds)
    if (this.defaultTarget) {
      for (const [target, adapter] of Object.entries(this.adapters)) {
        if (typeof adapter.recoverState === "function") {
          const pendingInputs = yield* call(() =>
            this.storage.getInputsByTarget(target, this.defaultTarget!)
          );
          yield* call(async () => await adapter.recoverState!(pendingInputs));
        }
      }
    }

    this.isInitialized = true;
    yield* this.emitStateTransition("startup", {
      publicConfig: this.getPublicConfig(),
      time: Date.now(),
    });

    // 5. Run the main background tasks concurrently
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
          process.exit(config.exitCode || 0);
        }
      };

      process.on(signal, listener);
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
 * Factory function to create a new Batcher instance.
 * Provides a cleaner API than using the constructor directly.
 *
 * @param config - Batcher configuration (adapters can be empty for dynamic registration)
 * @param storage - Optional storage instance (defaults to BatcherFileStorage)
 * @returns A new Batcher instance
 *
 * @example
 * ```typescript
 * const batcher = createNewBatcher({
 *   pollingIntervalMs: 1000,
 *   adapters: {},
 * });
 *
 * batcher.addBlockchainAdapter('ethereum', evmAdapter);
 * await batcher.init();
 * ```
 */
export function createNewBatcher<T extends DefaultBatcherInput = DefaultBatcherInput>(
  config: BatcherConfig<T, Record<string, BlockchainAdapter<any>>>,
  storage?: BatcherStorage<T>,
): Batcher<T> {
  return new Batcher(config, storage);
}

/**
 * Create and launch a new Batcher with optional signal handling
 */
export async function createAndLaunchBatcher<T extends DefaultBatcherInput = DefaultBatcherInput>(
  storage: BatcherStorage<T>,
  config: BatcherConfig<T>,
): Promise<void> {
  const batcher = createNewBatcher(config, storage);
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
