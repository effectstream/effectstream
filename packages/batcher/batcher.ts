import type { Hash } from "viem";
import { CryptoManager } from "@paima/crypto";
import { AddressType, TypeboxHelpers } from "@paima/utils";
import { Value } from "@sinclair/typebox/value";
import { BatcherCoordinator } from "./coordinator.ts";
import { BatcherPool } from "./pool.ts";
import { BatcherStorage } from "./storage.ts";
import { DefaultBatcherInput } from "./types.ts";
import { IChainConnector } from "./chain-connectors/connector.ts";
import { Buffer } from "node:buffer";

/**
 * Type-safe batcher configuration with compile-time connector validation
 *
 * This configuration system ensures that:
 * 1. If a defaultTarget is specified, it must be a valid key of the connectors Record
 * 2. At least one connector must be provided
 * 3. The configuration is validated at runtime for additional safety
 *
 * @example
 * ```typescript
 * // ✅ Valid configuration - TypeScript ensures type safety
 * const config: PaimaBatcherConfig<{
 *   evm: EvmChainConnector;
 *   polygon: EvmChainConnector;
 * }> = {
 *   pollingIntervalMs: 1000,
 *   connectors: {
 *     evm: evmConnector,
 *     polygon: polygonConnector,
 *   },
 *   defaultTarget: "evm", // ✅ Must be a key of connectors
 * };
 *
 * // ❌ Invalid configuration - TypeScript error
 * const invalidConfig: PaimaBatcherConfig<{ evm: EvmChainConnector }> = {
 *   pollingIntervalMs: 1000,
 *   connectors: { evm: evmConnector },
 *   defaultTarget: "invalid-target", // ❌ TypeScript error: not a valid key
 * };
 * ```
 */
type ValidConnectorKey<T> = T extends Record<infer K, any> ? K : never;

export interface PaimaBatcherConfig<
  TConnectors extends Record<string, IChainConnector> = Record<
    string,
    IChainConnector
  >,
> {
  pollingIntervalMs: number;
  connectors: TConnectors;
  defaultTarget?: ValidConnectorKey<TConnectors>; // Target to use when input.target is not specified - must be a key of connectors
}

export class PaimaBatcher<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /** Namespace used for signature verification messages */
  namespace: string = "paima_batcher";
  /** Timer ID for the periodic coordinator polling */
  private pollingIntervalID?: number;
  /** In-memory pool for tracking inputs before they're processed by the coordinator */
  private pool: BatcherPool<T> = new BatcherPool<T>();
  /** Available chain connectors keyed by target name */
  private readonly connectors: Record<string, IChainConnector>;
  /** Default target to use when input.target is not specified */
  private readonly defaultTarget: string;

  /**
   * Create a new PaimaBatcher with type-safe configuration
   *
   * @param coordinator - The coordinator for managing batch processing
   * @param storage - The storage system for persisting inputs
   * @param config - Type-safe configuration with compile-time and runtime validation
   *
   * Runtime validation ensures:
   * - At least one connector is provided
   * - If defaultTarget is specified, it exists in connectors
   * - Default target falls back to first available connector if not specified
   */
  constructor(
    private readonly coordinator: BatcherCoordinator,
    private readonly storage: BatcherStorage,
    private readonly config: PaimaBatcherConfig,
  ) {
    this.connectors = config.connectors;
    this.validateConfig();
    this.defaultTarget = config.defaultTarget ||
      Object.keys(config.connectors)[0];
  }

  /**
   * Validate the batcher configuration to ensure consistency
   */
  private validateConfig(): void {
    if (Object.keys(this.config.connectors).length === 0) {
      throw new Error(
        "At least one connector must be provided in the configuration",
      );
    }

    // TypeScript already ensures defaultTarget is a valid key if specified,
    // but we can add runtime validation for additional safety
    if (
      this.config.defaultTarget &&
      !(this.config.defaultTarget in this.config.connectors)
    ) {
      throw new Error(
        `Default target '${this.config.defaultTarget}' is not present in connectors. Available connectors: ${
          Object.keys(this.config.connectors).join(", ")
        }`,
      );
    }

    console.log(
      `🔧 Configuration validated. Available connectors: ${
        Object.keys(this.config.connectors)
      }`,
    );
    if (this.config.defaultTarget) {
      console.log(`🎯 Default target: ${this.config.defaultTarget}`);
    } else {
      console.log(
        `🎯 Using first available connector as default: ${
          Object.keys(this.config.connectors)[0]
        }`,
      );
    }
  }
  async init(): Promise<void> {
    this.coordinator.setPool(this.pool);
    await this.storage.init();
    this.pollingIntervalID = setInterval(
      async () => {
        await this.pollCoordinator();
      },
      this.config.pollingIntervalMs,
    );
  }
  async batchInput(input: T): Promise<void> {
    const verifiedSignature = await this.verifyInputSignature(input);
    if (!verifiedSignature) {
      throw new Error("Invalid signature");
    }
    await this.addToPool(input);
    const { count, size } = await this.storage.getInputCountAndSize();
    console.log(
      `✅ Added input from ${
        (input as unknown as DefaultBatcherInput).address
      } to batch queue. Queue size: ${count} inputs, ${size} bytes`,
    );
  }
  /**
   * Add input to both storage and the in-memory pool
   * This ensures the input is persisted and also available for immediate coordinator processing
   */
  /**
   * Get the appropriate chain connector for a given input
   * Uses input.target if specified, otherwise falls back to default target
   */
  private getConnectorForInput(input: T): IChainConnector {
    const target = (input as unknown as DefaultBatcherInput).target ||
      this.defaultTarget;
    const connector = this.connectors[target];

    if (!connector) {
      throw new Error(
        `No connector available for target: ${target}. Available targets: ${
          Object.keys(this.connectors).join(", ")
        }`,
      );
    }

    if (!connector.isReady()) {
      throw new Error(`Connector for target ${target} is not ready`);
    }

    return connector;
  }

  /**
   * Add input to both storage and the in-memory pool
   * This ensures the input is persisted and also available for immediate coordinator processing
   */
  async addToPool(input: T): Promise<void> {
    await this.storage.addInput(input);
    this.pool.push(input);
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

  async pollCoordinator(): Promise<void> {
    const isReady = this.coordinator.isReady();
    if (!isReady) return;

    // Process any pending batches using the connector system
    await this.processBatches();
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
    const pendingInputs = await this.storage.getAllInputs();

    if (pendingInputs.length === 0) {
      console.log("📭 No pending inputs to process");
      return;
    }

    console.log(`🚀 Processing ${pendingInputs.length} pending inputs...`);

    // Group inputs by target (connector)
    const inputsByTarget = new Map<string, T[]>();

    for (const input of pendingInputs) {
      const target = (input as unknown as DefaultBatcherInput).target ||
        this.defaultTarget;
      if (!inputsByTarget.has(target)) {
        inputsByTarget.set(target, []);
      }
      inputsByTarget.get(target)!.push(input as T);
    }

    // Process each target group
    for (const [target, inputs] of inputsByTarget) {
      const connector = this.connectors[target];
      if (!connector) {
        console.error(`❌ No connector available for target: ${target}`);
        continue;
      }

      try {
        await this.processBatchForTarget(connector, target, inputs);
      } catch (error) {
        console.error(`❌ Error processing batch for target ${target}:`, error);
        // Continue processing other targets even if one fails
      }
    }
  }

  /**
   * Process a batch for a specific target using the designated connector
   */
  private async processBatchForTarget(
    connector: IChainConnector,
    target: string,
    inputs: T[],
  ): Promise<void> {
    console.log(`🔗 Processing ${inputs.length} inputs for target: ${target}`);

    // TODO: Implement buildBatchData logic for creating optimized batch data
    // For now, we'll create a simple batch by concatenating inputs
    const batchData = this.buildBatchData(inputs);

    if (!batchData) {
      console.log(`📭 No valid inputs for target ${target}, skipping...`);
      return;
    }

    // Estimate fee and submit transaction
    const estimatedFee = await connector.estimateBatchFee(batchData);
    console.log(`💰 Estimated fee for ${target}: ${estimatedFee}`);

    const hash = await connector.submitBatch(batchData, estimatedFee);
    console.log(`✅ Submitted batch for ${target}: ${hash}`);

    // Wait for confirmation
    const receipt = await connector.waitForTransactionReceipt(hash);
    console.log(
      `✅ Transaction confirmed for ${target}: Block ${receipt.blockNumber}`,
    );

    // Validate Paima processing
    const validation = await connector.validatePaimaProcessing(
      receipt,
      receipt.blockNumber,
    );

    if (validation?.valid) {
      console.log(
        `✅ Paima processing validated for ${target}, rollup: ${validation.rollup}`,
      );

      // Remove successfully processed inputs from storage
      await this.storage.removeProcessedInputs(inputs);

      console.log(
        `✅ Successfully processed ${inputs.length} inputs for target ${target}`,
      );
    } else {
      console.error(
        `❌ Paima processing validation failed for target ${target}`,
      );
      // Keep inputs in storage for retry
    }
  }

  /**
   * Build optimized batch data from inputs
   * TODO: This should use the actual buildBatchData utility from @paima/concise
   */
  private buildBatchData(inputs: T[]): string | null {
    if (inputs.length === 0) return null;

    // For now, create a simple batch by joining input data
    // In the real implementation, this would use buildBatchData from @paima/concise
    const batchContent = inputs.map((input) =>
      (input as unknown as DefaultBatcherInput).input
    ).join("");

    if (!batchContent) return null;

    // Return hex-encoded batch data
    return `0x${Buffer.from(batchContent).toString("hex")}` as Hash;
  }
  /**
   * Validate the input and return a boolean indicating if the input is valid.
   * Default is a placeholder to be overridden by the user extending the PaimaBatcher class.
   * @param input - The input to validate.
   * @returns A boolean indicating if the input is valid.
   */
  async validateInput(input: T): Promise<boolean> {
    return !!input.signature.length && !!input.address.length;
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
}
