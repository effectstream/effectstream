/** This file contains the configuration definition for the batcher as well as
 * the functions to validate the correct definition of the configuration to be
 * imported by the batcher.
 */

import { DefaultBatcherInput } from "./types.ts";
import { IChainConnector } from "./chain-connectors/connector.ts";

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

  batchingCriteria: BatchingCriteriaConfig<TInput>;

  port?: number; // HTTP server port
  confirmationLevel?: "no-wait" | "wait-receipt" | "wait-paima-processed"; // Transaction confirmation levels
  maxRetries?: number; // Maximum retry attempts for failed transactions
  retryDelayMs?: number; // Delay between retry attempts
  enableHttpServer?: boolean; // Whether to start HTTP server
  enableEventSystem?: boolean; // Whether to enable Paima event system
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

  // Validate batching criteria configuration
  validateBatchingCriteria(config.batchingCriteria);

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
