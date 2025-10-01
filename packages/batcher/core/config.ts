/** This file contains the configuration definition for the batcher as well as
 * the functions to validate the correct definition of the configuration to be
 * imported by the batcher.
 */

import type { DefaultBatcherInput } from "./types.ts";
import type { IChainConnector } from "../connectors/connector.ts";
import type { BatchDataBuilder } from "../batch-data-builder/batch-data-builder.ts";
import type { ShutdownHooks } from "./batcher.ts";

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
 * // ✅ Valid configuration with per-connector batching criteria
 * const config: PaimaBatcherConfig<{
 *   evm: EvmChainConnector;
 *   polygon: EvmChainConnector;
 * }> = {
 *   pollingIntervalMs: 1000,
 *   connectors: {
 *     evm: evmConnector,
 *     polygon: polygonConnector,
 *   },
 *   defaultTarget: "evm",
 *   batchingCriteria: {
 *     // EVM batches by size (10 inputs)
 *     evm: { criteriaType: "size", maxBatchSize: 10 },
 *     // Polygon processes immediately (default: size=1)
 *     // polygon: omitted - uses DEFAULT_BATCHING_CRITERIA
 *   },
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
export type ValidConnectorKey<T> = T extends Record<infer K, any> ? K : never;

/**
 * Batching criteria configuration - replaces the separate coordinator system
 * Provides a unified way to define when batches should be processed
 */
export interface BatchingCriteriaConfig<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> {
  criteriaType: "time" | "size" | "value" | "hybrid" | "custom";

  // Required for "time" and "hybrid"
  timeWindowMs?: number;

  // Required for "size" and "hybrid"
  maxBatchSize?: number;

  // Required for "value" - returns numeric contribution per input
  valueAccumulatorFn?: (input: T) => number;
  targetValue?: number; // Required when using "value" criteria

  // Required for "custom" - user-provided function
  isBatchReadyFn?: (
    pendingInputs: T[],
    lastProcessTime?: number,
  ) => boolean | Promise<boolean>;
}

/**
 * Per-connector batching criteria configuration
 * Maps connector keys to their specific batching strategies
 */
export type PerConnectorBatchingCriteria<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TConnectors extends Record<string, IChainConnector> = Record<
    string,
    IChainConnector
  >,
> = Partial<
  Record<ValidConnectorKey<TConnectors>, BatchingCriteriaConfig<TInput>>
>;

/**
 * Default batching criteria when none specified for a connector
 * Processes inputs immediately (size=1) to ensure responsiveness
 */
export const DEFAULT_BATCHING_CRITERIA: BatchingCriteriaConfig = {
  criteriaType: "size",
  maxBatchSize: 1,
};

export interface PaimaBatcherConfig<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TConnectors extends Record<string, IChainConnector> = Record<
    string,
    IChainConnector
  >,
> {
  pollingIntervalMs: number;
  connectors: TConnectors;
  defaultTarget?: ValidConnectorKey<TConnectors>; // Target to use when input.target is not specified - must be a key of connectors

  /**
   * Per-connector batching criteria - allows different strategies per target
   * Connectors without specified criteria will use DEFAULT_BATCHING_CRITERIA (size=1)
   */
  batchingCriteria?: PerConnectorBatchingCriteria<TInput, TConnectors>;

  port?: number; // HTTP server port
  confirmationLevel?: "no-wait" | "wait-receipt" | "wait-paima-processed"; // Transaction confirmation levels
  maxRetries?: number; // Maximum retry attempts for failed transactions
  retryDelayMs?: number; // Delay between retry attempts
  enableHttpServer?: boolean; // Whether to start HTTP server
  enableEventSystem?: boolean; // Whether to enable Paima event system

  batchBuilding?: {
    /** Maximum size of batches in bytes */
    maxSize?: number;
    /** Target-specific batch builders */
    targetBuilders?: Record<string, BatchDataBuilder<TInput>>;
    /** Default batch builder to use when no target-specific builder exists */
    defaultBuilder?: BatchDataBuilder<TInput>;
  };

  shutdown?: {
    /** Custom shutdown hooks for extensibility */
    hooks?: ShutdownHooks<TInput>;
    /** Signal handling configuration */
    signalHandling?: {
      /** Signals to listen for (Deno signals) */
      signals?: string[];
      /** Custom shutdown handler */
      customShutdownHandler?: (signal: string) => Promise<void> | void;
      /** Exit code to use when shutting down */
      exitCode?: number;
    };
    /** Default shutdown timeout in milliseconds */
    timeoutMs?: number;
  };
}

/**
 * Validate the batcher configuration to ensure consistency
 * @param config - The configuration to validate
 * @returns void - throws error if invalid
 */
export function validateBatcherConfig<
  T extends DefaultBatcherInput,
  TConnectors extends Record<string, IChainConnector>,
>(config: PaimaBatcherConfig<T, TConnectors>): void {
  if (Object.keys(config.connectors).length === 0) {
    throw new Error(
      "At least one connector must be provided in the configuration",
    );
  }

  // TypeScript already ensures defaultTarget is a valid key if specified,
  // but we can add runtime validation for additional safety
  if (
    config.defaultTarget &&
    !(config.defaultTarget in config.connectors)
  ) {
    throw new Error(
      `Default target '${config.defaultTarget}' is not present in connectors. Available connectors: ${
        Object.keys(config.connectors).join(", ")
      }`,
    );
  }

  // Validate batching criteria configuration for each connector
  if (config.batchingCriteria) {
    for (
      const [target, criteria] of Object.entries(config.batchingCriteria) as [
        string,
        BatchingCriteriaConfig<T>,
      ][]
    ) {
      if (!(target in config.connectors)) {
        throw new Error(
          `Batching criteria specified for unknown connector '${target}'. Available connectors: ${
            Object.keys(config.connectors).join(", ")
          }`,
        );
      }
      validateBatchingCriteria(criteria);
    }
  }

  console.log(
    `🔧 Configuration validated. Available connectors: ${
      Object.keys(config.connectors)
    }`,
  );
  if (config.defaultTarget) {
    console.log(`🎯 Default target: ${config.defaultTarget}`);
  } else {
    console.log(
      `🎯 Using first available connector as default: ${
        Object.keys(config.connectors)[0]
      }`,
    );
  }

  // Log batching criteria per connector
  const connectorTargets = Object.keys(config.connectors);
  for (const target of connectorTargets) {
    const criteria = (config.batchingCriteria
      ?.[target as keyof typeof config.batchingCriteria] as
        | BatchingCriteriaConfig<T>
        | undefined) ?? DEFAULT_BATCHING_CRITERIA;
    console.log(`📏 ${target}: ${criteria.criteriaType} criteria`);
  }
}

/**
 * Validate the batching criteria configuration
 * @param criteria - The batching criteria to validate
 * @returns void - throws error if invalid
 */
export function validateBatchingCriteria<T extends DefaultBatcherInput>(
  criteria: BatchingCriteriaConfig<T>,
): void {
  // Validate required fields based on criteria type
  switch (criteria.criteriaType) {
    case "time":
      if (!criteria.timeWindowMs) {
        throw new Error("timeWindowMs is required for 'time' criteria type");
      }
      break;

    case "size":
      if (!criteria.maxBatchSize) {
        throw new Error("maxBatchSize is required for 'size' criteria type");
      }
      break;

    case "hybrid":
      if (!criteria.timeWindowMs) {
        throw new Error(
          "timeWindowMs is required for 'hybrid' criteria type",
        );
      }
      if (!criteria.maxBatchSize) {
        throw new Error(
          "maxBatchSize is required for 'hybrid' criteria type",
        );
      }
      break;

    case "value":
      if (!criteria.valueAccumulatorFn) {
        throw new Error(
          "valueAccumulatorFn is required for 'value' criteria type",
        );
      }
      if (!criteria.targetValue) {
        throw new Error("targetValue is required for 'value' criteria type");
      }
      break;

    case "custom":
      if (!criteria.isBatchReadyFn) {
        throw new Error(
          "isBatchReadyFn is required for 'custom' criteria type",
        );
      }
      break;

    default:
      throw new Error(
        `Unknown criteria type: ${(criteria as any).criteriaType}`,
      );
  }

  console.log(`📏 Batching criteria validated: ${criteria.criteriaType}`);
}
