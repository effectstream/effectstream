/**
 * Type-safe configuration system for EffectStream Batcher with compile-time adapter validation
 * and runtime safety checks.
 */

import type { DefaultBatcherInput } from "./types.ts";
import type { BlockchainAdapter } from "../adapters/adapter.ts";
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

export interface BatcherMqttConfig {
  enabled?: boolean;
  port?: number;
  host?: string;
  retainLastMessage?: boolean;
}

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
  TAdapters extends Record<string, BlockchainAdapter<any>> = Record<
    string,
    BlockchainAdapter<any>
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
  | "wait-effectstream-processed";

export interface BatcherConfig<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter<any>> = Record<
    string,
    BlockchainAdapter<any>
  >,
> {
  // Core configuration
  pollingIntervalMs: number;
  adapters?: TAdapters;
  defaultTarget?: ValidAdapterKey<TAdapters>;

  // Signature and networking
  namespace?: string;
  port?: number;
  enableHttpServer?: boolean;
  enableEventSystem?: boolean;
  mqtt?: BatcherMqttConfig;

  // Batching behavior
  batchingCriteria?: PerAdapterBatchingCriteria<TInput, TAdapters>;

  // Transaction handling
  confirmationLevel?:
    | ConfirmationLevel
    | Partial<Record<ValidAdapterKey<TAdapters>, ConfirmationLevel>>;
  maxRetries?: number;
  retryDelayMs?: number;

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
  namespace: "effectstream_batcher",
  pollingIntervalMs: 1000,
  confirmationLevel: "wait-receipt" as const,
  port: 3000,
  enableHttpServer: true,
  enableEventSystem: false,
  mqtt: {
    enabled: false,
    port: 8833,
    host: "0.0.0.0",
    retainLastMessage: true,
  },
  maxRetries: 3,
  retryDelayMs: 1000,
  shutdown: {
    timeoutMs: 30000,
    signalHandling: {
      signals: ["SIGINT", "SIGTERM"],
      exitCode: 0,
    },
  },
};

/**
 * TypeBox schema for BatcherConfig validation.
 * Uses T.Any for adapter and builder instances.
 */
export const BatcherConfigSchema = Type.Object({
  pollingIntervalMs: Type.Optional(
    Type.Number({
      minimum: 1,
      default: DEFAULT_CONFIG_VALUES.pollingIntervalMs,
    }),
  ),
  adapters: Type.Optional(
    Type.Record(Type.String(), Type.Any(), { default: {} }),
  ),
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
        Type.Literal("wait-effectstream-processed"),
      ]),
      Type.Record(
        Type.String(),
        Type.Union([
          Type.Literal("no-wait"),
          Type.Literal("wait-receipt"),
          Type.Literal("wait-effectstream-processed"),
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
  mqtt: Type.Optional(Type.Object({
    enabled: Type.Optional(
      Type.Boolean({ default: DEFAULT_CONFIG_VALUES.mqtt.enabled }),
    ),
    port: Type.Optional(Type.Number({
      minimum: 1,
      maximum: 65535,
      default: DEFAULT_CONFIG_VALUES.mqtt.port,
    })),
    host: Type.Optional(
      Type.String({ default: DEFAULT_CONFIG_VALUES.mqtt.host }),
    ),
    retainLastMessage: Type.Optional(Type.Boolean({
      default: DEFAULT_CONFIG_VALUES.mqtt.retainLastMessage,
    })),
  }, { additionalProperties: false })),

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

export type BatcherConfigFromSchema = Static<
  typeof BatcherConfigSchema
>;

/**
 * Applies TypeBox defaults to configuration object.
 * Does not replace domain validation - use validateBatcherConfig() separately.
 */
export function applyBatcherConfigDefaults<
  T extends DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter<any>>,
>(
  config: BatcherConfig<T, TAdapters>,
): BatcherConfig<T, TAdapters> {
  // Cast applies defaults while preserving provided values
  const casted = Value.Cast(BatcherConfigSchema as any, config as any);
  return casted as BatcherConfig<T, TAdapters>;
}

/**
 * Validates batcher configuration for consistency and required fields.
 * Allows empty adapters for dynamic registration before initialization.
 * Throws error if configuration is invalid.
 */
export function validateBatcherConfig<
  T extends DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter<any>>,
>(config: BatcherConfig<T, TAdapters>): void {
  // Allow empty adapters during initial config validation
  // Full validation happens before initialization via validatePreInit()
  const adapters = config.adapters || {};

  // TypeScript already ensures defaultTarget is a valid key if specified,
  // but we can add runtime validation for additional safety
  if (config.defaultTarget && !(config.defaultTarget in adapters)) {
    throw new Error(
      `Default target '${config.defaultTarget}' is not present in adapters. Available adapters: ${
        Object.keys(adapters).join(", ")
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
      if (!(target in adapters)) {
        throw new Error(
          `Batching criteria specified for unknown adapter '${target}'. Available adapters: ${
            Object.keys(adapters).join(", ")
          }`,
        );
      }
      validateBatchingCriteria(criteria);
    }
  }

  if (Object.keys(adapters).length > 0) {
    console.log(
      `🔧✅ Configuration validated. Available adapters: ${
        Object.keys(adapters)
      }`,
    );
    if (config.defaultTarget) {
      console.log(`🎯 Default target: ${config.defaultTarget}`);
    } else {
      console.log(
        `🎯 Using first available adapter as default: ${
          Object.keys(adapters)[0]
        }`,
      );
    }

    // Log batching criteria per adapter
    const adapterTargets = Object.keys(adapters);
    for (const target of adapterTargets) {
      const criteria = (config.batchingCriteria
        ?.[target as keyof typeof config.batchingCriteria] as
          | BatchingCriteriaConfig<T>
          | undefined) ?? DEFAULT_BATCHING_CRITERIA;
      console.log(`📏 ${target}: ${criteria.criteriaType} criteria`);
    }
  } else {
    console.log(
      `🔧✅ Configuration validated. No adapters configured yet. Use addBlockchainAdapter() to add adapters before initialization.`,
    );
  }
}

/**
 * Validates that batcher is ready for initialization.
 * Requires at least one adapter to be configured and a valid defaultTarget.
 * Call this before init() or runBatcher().
 */
export function validatePreInit<
  T extends DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter<any>>,
>(
  adapters: Record<string, BlockchainAdapter<any>>,
  defaultTarget?: string,
): void {
  if (Object.keys(adapters).length === 0) {
    throw new Error(
      "At least one blockchain adapter must be added before initialization. " +
        "Use addBlockchainAdapter() to add adapters before calling init() or runBatcher().",
    );
  }

  // Ensure defaultTarget is set
  if (!defaultTarget) {
    throw new Error(
      "Default target must be configured before initialization. " +
        "If using addBlockchainAdapter(), the first adapter will automatically become the default target. " +
        "Otherwise, specify defaultTarget in the configuration.",
    );
  }

  // Validate defaultTarget exists in adapters
  if (!(defaultTarget in adapters)) {
    throw new Error(
      `Default target '${defaultTarget}' is not present in adapters. Available adapters: ${
        Object.keys(adapters).join(", ")
      }`,
    );
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
