/**
 * Type-safe configuration system for PaimaBatcher with compile-time adapter validation
 * and runtime safety checks.
 */

import type { DefaultBatcherInput } from "./types.ts";
import type { BlockchainAdapter } from "../adapters/adapter.ts";
import type { BatchDataBuilder } from "../batch-data-builder/batch-data-builder.ts";
import type { ShutdownHooks } from "./shutdown-manager.ts";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Type-safe batcher configuration with compile-time adapter validation.
 *
 * Ensures type safety for adapter keys and provides runtime validation.
 * Supports per-adapter batching strategies and flexible confirmation levels.
 */
export type ValidAdapterKey<T> = T extends Record<infer K, any> ? K : never;

/**
 * Configuration for when and how batches should be processed.
 * Supports time-based, size-based, value-based, hybrid, and custom criteria.
 */
export interface BatchingCriteriaConfig<
  T extends DefaultBatcherInput = DefaultBatcherInput,
> {
  criteriaType: "time" | "size" | "value" | "hybrid" | "custom";

  // Time-based criteria
  timeWindowMs?: number;

  // Size-based criteria
  maxBatchSize?: number;

  // Value-based criteria
  valueAccumulatorFn?: (input: T) => number;
  targetValue?: number;

  // Custom criteria
  isBatchReadyFn?: (
    pendingInputs: T[],
    lastProcessTime?: number,
  ) => boolean | Promise<boolean>;
}

/**
 * Maps adapter targets to their specific batching criteria.
 * Adapters without criteria use DEFAULT_BATCHING_CRITERIA.
 */
export type PerAdapterBatchingCriteria<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter> = Record<
    string,
    BlockchainAdapter
  >,
> = Partial<
  Record<ValidAdapterKey<TAdapters>, BatchingCriteriaConfig<TInput>>
>;

/**
 * Default criteria when none specified for an adapter.
 * Processes inputs immediately for maximum responsiveness.
 */
export const DEFAULT_BATCHING_CRITERIA: BatchingCriteriaConfig = {
  criteriaType: "size",
  maxBatchSize: 1,
};

/**
 * TypeBox schema for BatchingCriteriaConfig validation.
 * Function fields use T.Any since they're runtime-validated separately.
 */
const TimeCriteriaSchema = Type.Object({
  criteriaType: Type.Literal("time"),
  timeWindowMs: Type.Number({ minimum: 1 }),
}, { additionalProperties: false });

const SizeCriteriaSchema = Type.Object({
  criteriaType: Type.Literal("size"),
  maxBatchSize: Type.Number({ minimum: 1, default: 1 }),
}, { additionalProperties: false });

const ValueCriteriaSchema = Type.Object({
  criteriaType: Type.Literal("value"),
  valueAccumulatorFn: Type.Any(),
  targetValue: Type.Number({ minimum: 0 }),
}, { additionalProperties: false });

const HybridCriteriaSchema = Type.Object({
  criteriaType: Type.Literal("hybrid"),
  timeWindowMs: Type.Number({ minimum: 1 }),
  maxBatchSize: Type.Number({ minimum: 1 }),
}, { additionalProperties: false });

const CustomCriteriaSchema = Type.Object({
  criteriaType: Type.Literal("custom"),
  isBatchReadyFn: Type.Any(),
}, { additionalProperties: false });

export const BatchingCriteriaConfigSchema = Type.Union([
  TimeCriteriaSchema,
  SizeCriteriaSchema,
  ValueCriteriaSchema,
  HybridCriteriaSchema,
  CustomCriteriaSchema,
]);

export type BatchingCriteriaConfigFromSchema = Static<
  typeof BatchingCriteriaConfigSchema
>;

/** Per-adapter criteria as a record keyed by adapter target */
export const PerAdapterBatchingCriteriaSchema = Type.Optional(
  Type.Record(Type.String(), BatchingCriteriaConfigSchema),
);

export type ConfirmationLevel =
  | "no-wait"
  | "wait-receipt"
  | "wait-paima-processed";

export interface PaimaBatcherConfig<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter> = Record<
    string,
    BlockchainAdapter
  >,
> {
  // Core configuration
  pollingIntervalMs: number;
  adapters: TAdapters;
  defaultTarget?: ValidAdapterKey<TAdapters>;

  // Signature and networking
  namespace?: string;
  port?: number;
  enableHttpServer?: boolean;
  enableEventSystem?: boolean;

  // Batching behavior
  batchingCriteria?: PerAdapterBatchingCriteria<TInput, TAdapters>;

  // Transaction handling
  confirmationLevel?:
    | ConfirmationLevel
    | Partial<Record<ValidAdapterKey<TAdapters>, ConfirmationLevel>>;
  maxRetries?: number;
  retryDelayMs?: number;

  // Batch building configuration
  batchBuilding?: {
    maxSize?: number;
    targetBuilders?: Record<string, BatchDataBuilder<TInput>>;
    defaultBuilder?: BatchDataBuilder<TInput>;
  };

  // Shutdown configuration
  shutdown?: {
    hooks?: ShutdownHooks<TInput>;
    signalHandling?: {
      signals?: string[];
      customShutdownHandler?: (signal: string) => Promise<void> | void;
      exitCode?: number;
    };
    timeoutMs?: number;
  };
}

/** Default configuration values for optional fields */
export const DEFAULT_CONFIG_VALUES = {
  namespace: "paima_batcher",
  pollingIntervalMs: 1000,
  confirmationLevel: "wait-receipt" as const,
  port: 3000,
  enableHttpServer: true,
  enableEventSystem: false,
  maxRetries: 3,
  retryDelayMs: 1000,
  batchBuilding: {},
  shutdown: {
    timeoutMs: 30000,
    signalHandling: {
      signals: ["SIGINT", "SIGTERM"],
      exitCode: 0,
    },
  },
};

/**
 * TypeBox schema for PaimaBatcherConfig validation.
 * Uses T.Any for adapter and builder instances.
 */
export const PaimaBatcherConfigSchema = Type.Object({
  pollingIntervalMs: Type.Optional(
    Type.Number({
      minimum: 1,
      default: DEFAULT_CONFIG_VALUES.pollingIntervalMs,
    }),
  ),
  adapters: Type.Record(Type.String(), Type.Any()),
  defaultTarget: Type.Optional(Type.String()),
  namespace: Type.Optional(
    Type.String({ default: DEFAULT_CONFIG_VALUES.namespace }),
  ),

  batchingCriteria: PerAdapterBatchingCriteriaSchema,

  port: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 65535,
      default: DEFAULT_CONFIG_VALUES.port,
    }),
  ),
  confirmationLevel: Type.Optional(
    Type.Union([
      Type.Union([
        Type.Literal("no-wait"),
        Type.Literal("wait-receipt"),
        Type.Literal("wait-paima-processed"),
      ]),
      Type.Record(
        Type.String(),
        Type.Union([
          Type.Literal("no-wait"),
          Type.Literal("wait-receipt"),
          Type.Literal("wait-paima-processed"),
        ]),
      ),
    ], { default: DEFAULT_CONFIG_VALUES.confirmationLevel }),
  ),
  maxRetries: Type.Optional(
    Type.Number({ minimum: 0, default: DEFAULT_CONFIG_VALUES.maxRetries }),
  ),
  retryDelayMs: Type.Optional(
    Type.Number({ minimum: 0, default: DEFAULT_CONFIG_VALUES.retryDelayMs }),
  ),
  enableHttpServer: Type.Optional(
    Type.Boolean({ default: DEFAULT_CONFIG_VALUES.enableHttpServer }),
  ),
  enableEventSystem: Type.Optional(
    Type.Boolean({ default: DEFAULT_CONFIG_VALUES.enableEventSystem }),
  ),

  batchBuilding: Type.Optional(Type.Object({
    maxSize: Type.Optional(Type.Number({ minimum: 1, default: 10000 })),
    targetBuilders: Type.Optional(Type.Record(Type.String(), Type.Any())),
    defaultBuilder: Type.Optional(Type.Any()),
  }, {
    additionalProperties: false,
    default: DEFAULT_CONFIG_VALUES.batchBuilding,
  })),

  shutdown: Type.Optional(Type.Object({
    hooks: Type.Optional(Type.Object({
      preShutdown: Type.Optional(Type.Any()),
      stopAcceptingInputs: Type.Optional(Type.Any()),
      waitForProcessing: Type.Optional(Type.Any()),
      cleanup: Type.Optional(Type.Any()),
      postShutdown: Type.Optional(Type.Any()),
    }, { additionalProperties: false })),
    signalHandling: Type.Optional(Type.Object({
      signals: Type.Optional(
        Type.Array(Type.String(), {
          default: DEFAULT_CONFIG_VALUES.shutdown.signalHandling.signals,
        }),
      ),
      customShutdownHandler: Type.Optional(Type.Any()),
      exitCode: Type.Optional(
        Type.Number({
          default: DEFAULT_CONFIG_VALUES.shutdown.signalHandling.exitCode,
        }),
      ),
    }, { additionalProperties: false })),
    timeoutMs: Type.Optional(
      Type.Number({
        minimum: 0,
        default: DEFAULT_CONFIG_VALUES.shutdown.timeoutMs,
      }),
    ),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

export type PaimaBatcherConfigFromSchema = Static<
  typeof PaimaBatcherConfigSchema
>;

/**
 * Applies TypeBox defaults to configuration object.
 * Does not replace domain validation - use validateBatcherConfig() separately.
 */
export function applyBatcherConfigDefaults<
  T extends DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter>,
>(
  config: PaimaBatcherConfig<T, TAdapters>,
): PaimaBatcherConfig<T, TAdapters> {
  // Cast applies defaults while preserving provided values
  const casted = Value.Cast(PaimaBatcherConfigSchema as any, config as any);
  return casted as PaimaBatcherConfig<T, TAdapters>;
}

/**
 * Validates batcher configuration for consistency and required fields.
 * Throws error if configuration is invalid.
 */
export function validateBatcherConfig<
  T extends DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter>,
>(config: PaimaBatcherConfig<T, TAdapters>): void {
  if (Object.keys(config.adapters).length === 0) {
    throw new Error(
      "At least one blockchain adapter must be provided in the configuration",
    );
  }

  // TypeScript already ensures defaultTarget is a valid key if specified,
  // but we can add runtime validation for additional safety
  if (
    config.defaultTarget &&
    !(config.defaultTarget in config.adapters)
  ) {
    throw new Error(
      `Default target '${config.defaultTarget}' is not present in adapters. Available adapters: ${
        Object.keys(config.adapters).join(", ")
      }`,
    );
  }

  // Validate batching criteria configuration for each adapter
  if (config.batchingCriteria) {
    for (
      const [target, criteria] of Object.entries(config.batchingCriteria) as [
        string,
        BatchingCriteriaConfig<T>,
      ][]
    ) {
      if (!(target in config.adapters)) {
        throw new Error(
          `Batching criteria specified for unknown adapter '${target}'. Available adapters: ${
            Object.keys(config.adapters).join(", ")
          }`,
        );
      }
      validateBatchingCriteria(criteria);
    }
  }

  console.log(
    `🔧✅ Configuration validated. Available adapters: ${
      Object.keys(config.adapters)
    }`,
  );
  if (config.defaultTarget) {
    console.log(`🎯 Default target: ${config.defaultTarget}`);
  } else {
    console.log(
      `🎯 Using first available adapter as default: ${
        Object.keys(config.adapters)[0]
      }`,
    );
  }

  // Log batching criteria per adapter
  const adapterTargets = Object.keys(config.adapters);
  for (const target of adapterTargets) {
    const criteria = (config.batchingCriteria
      ?.[target as keyof typeof config.batchingCriteria] as
        | BatchingCriteriaConfig<T>
        | undefined) ?? DEFAULT_BATCHING_CRITERIA;
    console.log(`📏 ${target}: ${criteria.criteriaType} criteria`);
  }
}

/**
 * Validates batching criteria configuration based on criteria type.
 * Throws error if required fields are missing.
 */
export function validateBatchingCriteria<T extends DefaultBatcherInput>(
  criteria: BatchingCriteriaConfig<T>,
): void {
  // Check required fields for each criteria type
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

  console.log(`✅ Batching criteria validated: ${criteria.criteriaType}`);
}
