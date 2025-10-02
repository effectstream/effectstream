import { BuiltinEvents, PaimaEventManager } from "@paima/event-client";
import { CryptoManager } from "@paima/crypto";
import { AddressType, TypeboxHelpers } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { toHex } from "viem";
import { call, type Operation, sleep, spawn, suspend } from "effection";
import type { BatcherStorage } from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BlockchainTransactionReceipt,
  IChainConnector,
} from "../connectors/connector.ts";
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

/**
 * PaimaBatcher - A type-safe, simplified blockchain batching system
 *
 * ARCHITECTURE:
 * - Storage is the SINGLE SOURCE OF TRUTH for all data
 * - Batching criteria is configurable via BatchingCriteriaConfig
 * - No in-memory pool - eliminates consistency issues entirely
 * - All operations are atomic and crash-safe
 *
 * BATCHING CRITERIA:
 * - "time": Process based on time windows (e.g., every 5 minutes)
 * - "size": Process based on batch size (e.g., when 100 inputs accumulated)
 * - "value": Process based on accumulated value (e.g., when total value reaches threshold)
 * - "hybrid": Process when either time OR size criteria is met
 * - "custom": Process based on user-defined function
 *
 * SIMPLICITY BENEFITS:
 * - No dual state management (pool + storage)
 * - No synchronization logic between data structures
 * - Single source of truth prevents inconsistencies
 * - Easier testing and debugging
 * - Better performance (no dual operations)
 */

interface ShutdownState {
  isShuttingDown: boolean;
  shutdownInitiatedAt: number | null;
  shutdownTimeoutMs: number;
  isProcessingBatch: boolean;
}

export interface ShutdownHooks<
  T extends DefaultBatcherInput,
> {
  preShutdown?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  stopAcceptingInputs?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  waitForProcessing?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  cleanup?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
  postShutdown?: (batcher: PaimaBatcher<T>) => Promise<void> | void;
}
export class PaimaBatcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /** Namespace used for signature verification messages */
  namespace: string = "paima_batcher";
  /** Timer ID for periodic batch processing */
  private pollingIntervalID?: number;
  /** Available chain connectors keyed by target name */
  private readonly connectors: Record<string, IChainConnector>;
  /** Default target to use when input.target is not specified */
  public readonly defaultTarget: string;
  /** Per-connector batching criteria configuration */
  private readonly batchingCriteria: Map<string, BatchingCriteriaConfig<T>>;
  /** Track when the last batch was processed for time-based criteria (per connector) */
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
  private shutdownState: ShutdownState = {
    isShuttingDown: false,
    shutdownInitiatedAt: null,
    shutdownTimeoutMs: 30000,
    isProcessingBatch: false,
  };
  /** Callbacks to return the transaction receipt after the transaction is confirmed */
  private submissionCallbacks: Map<
    string,
    {
      resolve: (
        result: BlockchainTransactionReceipt & { rollup?: number } | null,
      ) => void;
      reject: (error: Error) => void;
      timeoutId: number;
    }
  > = new Map();
  /** Batch data builder for constructing batch payloads */
  private readonly batchDataBuilder: BatchDataBuilder<T>;
  /** State transition listeners keyed by prefix */
  private stateTransitionListeners: Map<
    string,
    (payload: any) => void | Promise<void>
  > = new Map();

  /**
   * Create a new PaimaBatcher with type-safe configuration
   *
   * @param storage - The storage system for persisting inputs
   * @param config - Type-safe configuration with unified batching criteria
   *
   * Runtime validation ensures:
   * - At least one connector is provided
   * - If defaultTarget is specified, it exists in connectors
   * - Default target falls back to first available connector if not specified
   */
  public readonly config: PaimaBatcherConfig<
    T,
    Record<string, IChainConnector>
  >;

  constructor(
    private readonly storage: BatcherStorage<T>,
    config: PaimaBatcherConfig<
      T,
      Record<string, IChainConnector>
    >,
  ) {
    const cfg = applyBatcherConfigDefaults(config);
    this.config = cfg;
    this.connectors = cfg.connectors;
    this.validateConfig();
    this.defaultTarget = cfg.defaultTarget ||
      Object.keys(cfg.connectors)[0];

    // Initialize per-connector batching criteria
    this.batchingCriteria = new Map();
    for (const target of Object.keys(this.connectors)) {
      const criteria = cfg.batchingCriteria
        ?.[target as keyof typeof cfg.batchingCriteria] ??
        DEFAULT_BATCHING_CRITERIA;
      this.batchingCriteria.set(target, criteria);
    }

    // Initialize per-connector last process times
    this.lastProcessTime = new Map();
    const now = Date.now();
    for (const target of Object.keys(this.connectors)) {
      this.lastProcessTime.set(target, now);
    }

    this.batchDataBuilder = this.initializeBatchDataBuilder();
    this.port = this.config.port!;
    this.enableHttpServer = this.config.enableHttpServer!;
    this.enableEventSystem = this.config.enableEventSystem!;
    this.namespace = this.config.namespace ?? this.namespace;
  }

  /**
   * Register a state transition listener for a given prefix.
   * Throws if a listener already exists for the prefix.
   */
  addStateTransition<Prefix extends string>(
    prefix: Prefix,
    listener: (payload: any) => void | Promise<void>,
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

  /** Emit a state transition event to the registered listener if enabled. */
  private async emitStateTransition(
    prefix: string,
    payload: any,
  ): Promise<void> {
    if (!this.enableEventSystem) return;
    const listener = this.stateTransitionListeners.get(prefix);
    if (!listener) return;
    try {
      await listener(payload);
    } catch (error) {
      // Re-emit as error; guard against recursive error loops
      const hasErrorListener = this.stateTransitionListeners.has("error");
      if (prefix !== "error" && hasErrorListener) {
        try {
          await this.stateTransitionListeners.get("error")!({
            phase: "event-listener",
            target: undefined,
            error,
            time: Date.now(),
          });
        } catch {
          // swallow
        }
      }
    }
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
   * @param target - The target chain/connector name
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
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.submissionCallbacks.delete(input.signature);
        reject(new Error("Confirmation timeout"));
      }, timeoutMs);

      this.submissionCallbacks.set(input.signature, {
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
    });
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

    // Check each connector target independently for batching readiness
    const targetsToProcess: string[] = [];
    for (const target of Object.keys(this.connectors)) {
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
    const allTargets = Object.keys(this.connectors);
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
    connectorTargets: string[];
  }> {
    const connectorTargets = Object.keys(this.connectors);
    const targets: Array<{
      target: string;
      isReady: boolean;
      pendingInputs: number;
      criteriaType: string;
      timeSinceLastProcess: number;
    }> = [];

    let totalPendingInputs = 0;

    for (const target of connectorTargets) {
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
      connectorTargets,
    };
  }

  /**
   * Get shutdown status information
   */
  getShutdownStatus(): {
    isShuttingDown: boolean;
    shutdownInitiatedAt: number | null;
    shutdownTimeoutMs: number;
    isProcessingBatch: boolean;
  } {
    return {
      isShuttingDown: this.shutdownState.isShuttingDown,
      shutdownInitiatedAt: this.shutdownState.shutdownInitiatedAt,
      shutdownTimeoutMs: this.shutdownState.shutdownTimeoutMs,
      isProcessingBatch: this.shutdownState.isProcessingBatch,
    };
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
    connectorTargets: string[];
    /** Per-connector batching criteria types */
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
      connectorTargets: Object.keys(this.connectors),
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
    if (this.shutdownState.isShuttingDown) return;

    this.shutdownState.isShuttingDown = true;
    this.shutdownState.shutdownInitiatedAt = Date.now();
    this.shutdownState.shutdownTimeoutMs = options?.timeoutMs ??
      this.shutdownState.shutdownTimeoutMs;

    console.log("🔄 Stopping batcher gracefully...");

    try {
      // Phase 1: Pre-shutdown (custom hook)
      if (hooks?.preShutdown) {
        yield* call(() => hooks.preShutdown!(this));
      }

      // Phase 2: Stop accepting new inputs
      this.stopPolling();
      yield* call(() => this.stopHttpServer());
      if (hooks?.stopAcceptingInputs) {
        yield* call(() => hooks.stopAcceptingInputs!(this));
      }

      // Phase 3: Wait for ongoing processing
      yield* call(() => this.waitForOngoingProcessing(options?.timeoutMs));
      if (hooks?.waitForProcessing) {
        yield* call(() => hooks.waitForProcessing!(this));
      }

      // Phase 4: Cleanup resources
      yield* call(() => this.cleanupResources());
      if (hooks?.cleanup) {
        yield* call(() => hooks.cleanup!(this));
      }

      // Phase 5: Post-shutdown (custom hook)
      if (hooks?.postShutdown) {
        yield* call(() => hooks.postShutdown!(this));
      }

      console.log("✅ Batcher shutdown complete");
    } catch (error) {
      console.error("❌ Error during graceful shutdown:", error);
      if (options?.force) {
        console.log("🔧 Force shutdown due to error");
      } else {
        throw error;
      }
    }
  }

  /**
   * Graceful shutdown - stop accepting new batches and wait for current processing to finish
   * Legacy async version for backward compatibility
   */
  async gracefulShutdown(
    hooks?: ShutdownHooks<any>,
    options?: { timeoutMs?: number; force?: boolean },
  ): Promise<void> {
    if (this.shutdownState.isShuttingDown) return;

    this.shutdownState.isShuttingDown = true;
    this.shutdownState.shutdownInitiatedAt = Date.now();
    this.shutdownState.shutdownTimeoutMs = options?.timeoutMs ??
      this.shutdownState.shutdownTimeoutMs;

    console.log("🔄 Stopping batcher gracefully...");

    try {
      // Phase 1: Pre-shutdown (custom hook)
      await hooks?.preShutdown?.(this);

      // Phase 2: Stop accepting new inputs
      this.stopPolling();
      await this.stopHttpServer();
      await hooks?.stopAcceptingInputs?.(this);

      // Phase 3: Wait for ongoing processing
      await this.waitForOngoingProcessing(options?.timeoutMs);
      await hooks?.waitForProcessing?.(this);

      // Phase 4: Cleanup resources
      await this.cleanupResources();
      await hooks?.cleanup?.(this);

      // Phase 5: Post-shutdown (custom hook)
      await hooks?.postShutdown?.(this);

      console.log("✅ Batcher shutdown complete");
    } catch (error) {
      console.error("❌ Error during graceful shutdown:", error);
      if (options?.force) {
        console.log("🔧 Force shutdown due to error");
      } else {
        throw error;
      }
    }
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
   * Wait for any ongoing batch processing to complete
   */
  private async waitForOngoingProcessing(timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? this.shutdownState.shutdownTimeoutMs;
    const startTime = Date.now();

    if (!this.shutdownState.isProcessingBatch) {
      return;
    }

    console.log("⏳ Waiting for current batch processing to complete...");

    while (this.shutdownState.isProcessingBatch) {
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Shutdown timeout: batch processing did not complete within ${timeout}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Cleanup additional resources (can be overridden by subclasses)
   */
  protected async cleanupResources(): Promise<void> {
    // Default implementation - can be extended by subclasses
  }

  /**
   * Process and submit batches using the appropriate chain connectors
   * This method handles the core batch processing logic including:
   * - Grouping inputs by target/connector
   * - Building optimized batch data
   * - Submitting to appropriate blockchain via connectors
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
      // Group inputs by target (connector)
      const inputsByTarget = new Map<string, T[]>();

      for (const input of pendingInputs) {
        const target = input.target || this.defaultTarget;
        if (!inputsByTarget.has(target)) {
          inputsByTarget.set(target, []);
        }
        inputsByTarget.get(target)!.push(input);
      }

      for (const [target, inputs] of inputsByTarget) {
        const connector = this.connectors[target];
        if (!connector) {
          console.error(`❌ No connector available for target: ${target}`);
          continue;
        }

        try {
          await this.processBatchForTarget(connector, target, inputs);
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
      console.log("📭 No targets to process");
      return;
    }

    console.log(
      `🚀 Processing batches for targets: ${targetsToProcess.join(", ")}`,
    );

    this.shutdownState.isProcessingBatch = true;

    try {
      for (const target of targetsToProcess) {
        const connector = this.connectors[target];
        if (!connector) {
          console.error(`❌ No connector available for target: ${target}`);
          continue;
        }

        // Get inputs for this specific target
        const targetInputs = await this.storage.getInputsByTarget(
          target,
          this.defaultTarget,
        );

        if (targetInputs.length === 0) {
          console.log(`📭 No inputs for target ${target}, skipping...`);
          continue;
        }

        try {
          await this.emitStateTransition("batch:process:start", {
            target,
            inputCount: targetInputs.length,
            time: Date.now(),
          });
          await this.processBatchForTarget(connector, target, targetInputs);
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
   * Process a batch for a specific target using the designated connector
   * @param connector - The connector to use to process the batch
   * @param target - The target to process the batch for
   * @param inputs - The inputs to process the batch for
   * @param timeout - The timeout in milliseconds to use to wait for the batch to be processed by paima engine (default: 60000)
   */
  private async processBatchForTarget(
    connector: IChainConnector,
    target: string,
    inputs: T[],
    timeout: number = 60000,
  ): Promise<void> {
    console.log(`🔗 Processing ${inputs.length} inputs for target: ${target}`);

    // Build batch data using the target-specific batch builder
    const batchResult = this.buildBatchData(inputs, target);

    if (!batchResult || batchResult.data === "") {
      console.log(`📭 No valid inputs for target ${target}, skipping...`);
      return;
    }

    const { selectedInputs, data } = batchResult;

    // Convert JSON string to hex bytes for blockchain submission
    // TODO dont use viem or pass the toHex responsibility to the connector
    const hexData = toHex(data);

    // Estimate fee and submit transaction
    const estimatedFee = await connector.estimateBatchFee(hexData);
    // The estimated fee by default is the configured PaimaL2 fee, but can be overridden by the connector.
    console.log(`💰 Estimated fee for ${target}: ${estimatedFee}`);
    await this.emitStateTransition("batch:fee-estimate", {
      target,
      estimatedFee,
      time: Date.now(),
    });

    const hash = await connector.submitBatch(hexData, estimatedFee);
    console.log(`✅ Submitted batch for ${target}: ${hash}`);
    await this.emitStateTransition("batch:submit", {
      target,
      estimatedFee,
      txHash: hash,
      time: Date.now(),
    });

    // Wait for confirmation
    const receipt = await connector.waitForTransactionReceipt(hash);
    await this.emitStateTransition("batch:receipt", {
      target,
      blockNumber: receipt.blockNumber,
      time: Date.now(),
    });

    // Wait for Paima Engine processing using event listening
    try {
      const eventFilterChain = connector.getSyncProtocolName?.() ??
        connector.getChainName();
      const processingResult = await this.waitForPaimaProcessed(
        receipt,
        eventFilterChain,
        timeout,
      );

      // Remove successfully processed inputs from storage (atomic operation)
      await this.storage.removeProcessedInputs(selectedInputs);

      if (processingResult) {
        await this.emitStateTransition("batch:paima-processed", {
          target,
          latestBlock: processingResult.latestBlock,
          rollup: processingResult.rollup,
          time: Date.now(),
        });

        // Resolve callbacks for all processed inputs
        for (const input of selectedInputs) {
          const callbacks = this.submissionCallbacks.get(input.signature);
          if (callbacks) {
            callbacks.resolve({
              ...receipt,
              rollup: processingResult.rollup,
            });
            clearTimeout(callbacks.timeoutId);
            this.submissionCallbacks.delete(input.signature);
          }
        }
      } else {
        // Error keep inputs in storage for retry
        console.error(
          `❌ Paima processing validation failed for target ${target}`,
        );
        await this.emitStateTransition("error", {
          phase: "paima",
          target,
          error: new Error("Paima processing validation failed"),
          time: Date.now(),
        });

        // Reject callbacks for failed processing
        for (const input of selectedInputs) {
          const callbacks = this.submissionCallbacks.get(input.signature);
          if (callbacks) {
            const error = new Error("Paima processing validation failed");
            callbacks.reject(error);
            clearTimeout(callbacks.timeoutId);
            this.submissionCallbacks.delete(input.signature);
          }
        }
      }
    } catch (error) {
      // Error keep inputs in storage for retry
      console.error(
        `❌ Error waiting for Paima processing for target ${target}:`,
        error,
      );
      await this.emitStateTransition("error", {
        phase: "paima",
        target,
        error,
        time: Date.now(),
      });

      // Reject callbacks for failed processing
      for (const input of selectedInputs) {
        const callbacks = this.submissionCallbacks.get(input.signature);
        if (callbacks) {
          const err = error instanceof Error
            ? error
            : new Error("Unknown error during Paima processing");
          callbacks.reject(err);
          clearTimeout(callbacks.timeoutId);
          this.submissionCallbacks.delete(input.signature);
        }
      }
    }
    await this.emitStateTransition("batch:process:end", {
      target,
      processedCount: selectedInputs.length,
      success: true,
      time: Date.now(),
    });
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
    const connector = this.connectors[target];
    const options = {
      maxSize: typeof connector.getMaxBatchSize === "function"
        ? connector.getMaxBatchSize()
        : this.config.batchBuilding?.maxSize,
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
    return !!input.signature.length && !!input.address.length;
  }

  /**
   * Wait for the Paima Engine to process a submitted transaction.
   * Listens for SyncChains events to confirm Paima Engine has processed the block.
   * @param transactionReceipt - The transaction receipt to wait for
   * @param chainName - The chain name to filter events
   * @param timeout - Timeout in milliseconds (default: 60000)
   * @returns Promise resolving to processing info or null if timeout
   */
  private async waitForPaimaProcessed(
    transactionReceipt: BlockchainTransactionReceipt,
    chainName: string,
    timeout: number = 60000,
  ): Promise<{ latestBlock: number; rollup: number } | null> {
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
                if (latestBlock > Number(transactionReceipt.blockNumber)) {
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
      input.timestamp +
      walletAddress +
      input.input
    )
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLocaleLowerCase();
  }

  /**
   * Run the batcher using Effection structured concurrency.
   * This replaces the traditional init() + setInterval pattern with an Effection operation
   * that provides better cancellation and resource management.
   *
   * @returns An Effection operation that runs the batcher polling loop
   */
  *runBatcher(): Operation<void> {
    // Initialize storage and mark as initialized
    yield* call(() => this.storage.init());
    this.isInitialized = true;

    // Start HTTP server if enabled
    if (this.enableHttpServer) {
      yield* call(() => this.startHttpServer());
    }

    yield* call(() =>
      this.emitStateTransition("startup", {
        publicConfig: this.getPublicConfig(),
        time: Date.now(),
      })
    );

    // Spawn polling task
    yield* spawn(function* (this: PaimaBatcher<T>) {
      while (!this.shutdownState.isShuttingDown) {
        yield* sleep(this.config.pollingIntervalMs);

        if (!this.shutdownState.isShuttingDown) {
          yield* call(() => this.pollBatcher());
        }
      }
    }.bind(this));

    // Keep the operation alive until cancelled
    yield* suspend();
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
  const batcher = new PaimaBatcher(storage, config);
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
    `⛓️ Connector Targets: ${publicConfig.connectorTargets.join(", ")}`,
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
