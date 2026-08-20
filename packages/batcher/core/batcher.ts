import { CryptoManager } from "@effectstream/crypto";
import { call, lift, resource, sleep, spawn, suspend } from "effection";
import type { Operation } from "effection";
import type {
  BatcherStorage,
  ReconciliationReport,
  RequestStatusRecord,
} from "./storage.ts";
import type { DefaultBatcherInput } from "./types.ts";
import type {
  BlockchainAdapter,
  BlockchainTransactionReceipt,
} from "../adapters/adapter.ts";
import type { BatchingCriteriaConfig, BatcherConfig } from "./config.ts";
import {
  applyBatcherConfigDefaults,
  DEFAULT_BATCHING_CRITERIA,
  DEFAULT_CONFIG_VALUES,
  validateBatcherConfig,
  validateBatchingCriteria,
  validatePreInit,
} from "./config.ts";
import { startBatcherHttpServer } from "../server/batcher-server.ts";
import { DatabaseStorage } from "./storage.ts";
import { isTrackingStorage } from "./storage.ts";
import { buildRequestKey, computeRequestId } from "./request-id.ts";
import { resolveReplayKey } from "./replay-key.ts";
import { assertInputIsFresh } from "./input-freshness.ts";
import { BatchProcessor } from "./batch-processor.ts";
import { InputValidationError } from "./errors.ts";
import {
  type BatcherShutdownState,
  type ShutdownHooks,
  ShutdownManager,
} from "./shutdown-manager.ts";
import type { BatcherGrammar, BatcherListener } from "./batcher-events.ts";
import { BuiltinEvents, EventManager } from "@effectstream/event-client";
import { ENV } from "@effectstream/utils/node-env";

/**
 * Custom error class for input validation failures
 * Provides structured error information with appropriate HTTP status codes
 */
// Defined in ./errors.ts so `batch-processor.ts` can throw the same class
// without importing this module back. Re-exported here because it has always
// been part of this module's public surface.
export { InputTerminalError, InputValidationError } from "./errors.ts";

export interface AuthenticatedInputContext {
  /** Adapter target resolved and verified by the batcher. */
  target: string;
}

/**
 * What an accepted submission returns.
 *
 * The id and the receipt are separate fields rather than one merged object
 * because they answer different questions and arrive at different times: the id
 * exists the moment the input is journaled (which is what `no-wait` waits for),
 * while the receipt only exists once a batch reached the chain. An envelope
 * says that plainly — `receipt: null` is "accepted, nothing on chain yet", not
 * "nothing happened".
 */
export interface BatchInputResult {
  /**
   * Deterministic id for this request (spec FR-006), returned at EVERY
   * confirmation level. Recomputable from the payload; poll with it.
   */
  requestId: string;
  /** The transaction receipt, or null when the caller did not wait for one. */
  receipt: (BlockchainTransactionReceipt & { rollup?: number }) | null;
  /**
   * This submission was recognised as a REPLAY of one already tracked, so
   * nothing new was queued (spec FR-006b). `requestId` is the ORIGINAL
   * request's — poll that, it is the one with a fate.
   *
   * A duplicate always comes back with `receipt: null` whatever confirmation
   * level was asked for. The receipt-callback map holds one waiter per content
   * key, so a second waiter would silently evict the first; the caller holds
   * the id instead, and is in any case usually the same client retrying.
   */
  duplicate?: boolean;
}

/**
 * Context for the admission surcharge, once the input has been validated and
 * its true cost is known.
 *
 * Admission is charged in two phases because the cost of a request cannot be
 * known when it arrives. At authentication all we know is that *a* request
 * turned up, so it is charged a flat unit; only after the adapter has
 * deserialized the payload can we say how much verification work it will
 * actually cause. Charging the difference here keeps the expensive shape from
 * drawing down the same budget as a trivial one, while still refusing an
 * unauthenticated caller a free deserialize.
 */
export interface AdmissionWeightContext {
  target: string;
  /** Total units this input should cost, as reported by the adapter. */
  weight: number;
  /** Units already charged at authentication. */
  alreadyCharged: number;
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
  private pollingIntervalID?: ReturnType<typeof setInterval>;
  /** Available blockchain adapters keyed by target name */
  private adapters: Record<string, BlockchainAdapter<any>>;
  /** Default target to use when input.target is not specified */
  public defaultTarget?: string;
  /**
   * True when the operator named the default target (config `defaultTarget` or
   * `setDefaultTarget()`), false when it was inferred from the first adapter.
   * Strict routing only guards the inferred case — an explicit default IS the
   * operator saying where unaddressed input belongs.
   */
  private defaultTargetIsExplicit = false;
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
  /** How long `init()` waits for adapters to become servable before binding. */
  private readonly httpServerReadinessTimeoutMs: number;
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
      timeoutId: ReturnType<typeof setTimeout>;
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
   * Targets already warned about having no derivable replay key. The warning
   * matters — that deployment has no duplicate protection — but it is a
   * property of the target, not of the request, so it is said once.
   */
  private readonly replayKeylessTargetsLogged = new Set<string>();

  /** Timer driving the retention sweep; absent on a queue-only backend. */
  private retentionIntervalID?: ReturnType<typeof setInterval>;
  /**
   * What retention has done so far. Exposed through `/queue-stats` because a
   * sweep that silently stopped working looks exactly like one that has
   * nothing to do, and the difference only becomes visible as unbounded growth
   * weeks later.
   */
  private readonly retentionMetrics: {
    prunedLastRun: number;
    prunedTotal: number;
    lastRunAt?: string;
    lastError?: string;
  } = { prunedLastRun: 0, prunedTotal: 0 };

  /**
   * Create a new Batcher with type-safe configuration
   *
   * @param config - Type-safe configuration with unified batching criteria
   * @param storage - The storage system for persisting inputs.
   *
   * Defaults to `DatabaseStorage` over an embedded PgLite database in
   * `./batcher-data`. It replaced `FileStorage` as the default because request
   * tracking needs the queue, each request's status and its replay key to be
   * written together or not at all, and separate files cannot be. Zero-config
   * is preserved: the database is embedded, so there is still nothing to
   * install and nothing to configure.
   *
   * BREAKING for anyone relying on the default: an existing
   * `./batcher-data/pending-inputs.jsonl` is imported on first `init()` and
   * renamed to `.imported`, and the queue afterwards lives in the database.
   * Pass `new FileStorage(dir)` explicitly to keep the old backend — it is
   * still exported and still fully supported for the queue.
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
    private readonly storage: BatcherStorage<T> = new DatabaseStorage<T>(
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
      this.defaultTargetIsExplicit = !!cfg.defaultTarget;
      if (!cfg.defaultTarget) {
        console.log(
          `🎯 Auto-set default target to '${this.defaultTarget}' (first adapter from config)`,
        );
      }
    } else {
      // No adapters in config - will be set when first adapter is added via addBlockchainAdapter()
      this.defaultTarget = cfg.defaultTarget;
      this.defaultTargetIsExplicit = !!cfg.defaultTarget;
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
      emitStateTransition: (prefix: string, payload: any) =>
        this.emitStateTransitionAsync(prefix, payload),
      storage: this.storage,
      submissionCallbacks: this.submissionCallbacks,
      getCallbackKey: (input: T) => this.getInputCallbackKey(input),
      waitForEffectStreamProcessed: (
        target: string,
        receipt: BlockchainTransactionReceipt,
        timeout: number,
      ) => this.waitForEffectStreamProcessed(target, receipt, timeout),
      getRetryPolicy: (target?: string) => {
        const override = target ? this.config.perTarget?.[target] : undefined;
        return {
          maxRetries: override?.maxRetries ?? this.config.maxRetries ?? 3,
          retryDelayMs: override?.retryDelayMs ?? this.config.retryDelayMs ?? 1000,
        };
      },
      setTargetCooldown: (target: string, ms: number) =>
        this.setTargetCooldown(target, ms),
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
    this.httpServerReadinessTimeoutMs =
      this.config.httpServerReadinessTimeoutMs ??
        DEFAULT_CONFIG_VALUES.httpServerReadinessTimeoutMs;
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
   * Emit a state transition from an ordinary async context.
   *
   * `emitStateTransition` below is a generator, meant to be driven with `yield*`
   * inside an Effection operation. `await`ing it does NOT run its body — it
   * resolves to the generator object — so async callers need this instead. The
   * batch processor has always used this path; the per-request events use it
   * for the same reason.
   *
   * A listener that throws is reported to the `error` listener and otherwise
   * swallowed: events are observability, and nothing the batcher does may
   * depend on one having been delivered.
   */
  private async emitStateTransitionAsync(
    prefix: string,
    payload: any,
  ): Promise<void> {
    if (!this.enableEventSystem) return;
    const listener = this.stateTransitionListeners.get(prefix);
    if (!listener) return;
    try {
      await listener(payload);
    } catch (error) {
      const hasErrorListener = this.stateTransitionListeners.has("error");
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

  /**
   * Per-request lifecycle event. Observability only — no batcher logic may
   * branch on one, and a listener's failure never affects the request.
   */
  private async emitRequestEvent<
    Prefix extends "request:accepted" | "request:terminal",
  >(prefix: Prefix, payload: BatcherGrammar[Prefix]): Promise<void> {
    await this.emitStateTransitionAsync(prefix, payload);
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
    this.defaultTargetIsExplicit = true;
    return this;
  }

  /**
   * Initialize the batcher. Pass `startPolling: false` if you'll drive polling
   * yourself via `runPollingLoop()` — otherwise both polling systems run
   * concurrently and can submit duplicate transactions.
   */
  async init(opts: { startPolling?: boolean } = {}): Promise<void> {
    if (this.isInitialized) return;

    const startPolling = opts.startPolling !== false;

    validatePreInit(this.adapters, this.defaultTarget);

    const now = Date.now();
    for (const target of Object.keys(this.adapters)) {
      this.lastProcessTime.set(target, now);
    }

    // Pass the default target so storage can stamp rows written before
    // per-row targets existed (see FileStorage.init).
    await this.storage.init(this.defaultTarget);

    for (const [target, adapter] of Object.entries(this.adapters)) {
      if (typeof adapter.recoverState === "function") {
        const pendingInputs = await this.storage.getInputsByTarget(
          target,
          this.defaultTarget!, // defaultTarget is guaranteed to be set at this point
        );
        await adapter.recoverState(pendingInputs);
      }
    }

    if (startPolling) {
      this.pollingIntervalID = setInterval(
        async () => {
          await this.pollBatcher();
        },
        this.config.pollingIntervalMs,
      );
    }

    this.startRetentionSweep();

    // Start HTTP server if enabled. `startHttpServer()` itself waits for every
    // adapter to be past its loop-blocking startup — see there for why.
    if (this.enableHttpServer) {
      await this.startHttpServer();
    }

    this.isInitialized = true;
    await this.emitStateTransitionAsync("startup", {
      publicConfig: this.getPublicConfig(),
      time: Date.now(),
    });
  }
  /**
   * Add a user input to the batch queue after validating the signature
   * @param input - The input to add to the batch queue
   * @param confirmationLevel - The level of confirmation to wait for
   * @param timeoutMs - Timeout in milliseconds for confirmation (default: 300000)
   * @returns the request's id, plus its receipt when the caller waited for one
   */
  async batchInput(
    input: T,
    confirmationLevel: "no-wait" | "wait-receipt" | "wait-effectstream-processed" =
      "wait-receipt",
    timeoutMs: number = 300_000,
    onAuthenticated?: (
      context: AuthenticatedInputContext,
    ) => Promise<void> | void,
    onAdmissionWeight?: (
      context: AdmissionWeightContext,
    ) => Promise<void> | void,
  ): Promise<BatchInputResult> {
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

    // Strict routing: with more than one product registered and NO default the
    // operator actually chose, an unaddressed input must not silently land in
    // the first-registered product's queue (and on its wallet's dust) — that
    // default was inferred from registration order, not intended.
    //
    // A default the operator named (config `defaultTarget` or
    // `setDefaultTarget()`) is exactly the statement "unaddressed input goes
    // here", so it is honoured. Force either behaviour with
    // `requireExplicitTarget`.
    const requireExplicitTarget = this.config.requireExplicitTarget ??
      (Object.keys(this.adapters).length > 1 && !this.defaultTargetIsExplicit);
    if (!input.target && requireExplicitTarget) {
      throw new InputValidationError(
        `Input is missing "target". This batcher serves multiple targets ` +
          `(${Object.keys(this.adapters).join(", ")}) and has no explicit ` +
          `default; name the one you mean, or call setDefaultTarget().`,
        400,
      );
    }

    const target = input.target || this.defaultTarget!;
    const adapter = this.adapters[target];
    if (!adapter) {
      throw new InputValidationError(`Adapter for target ${target} not found. Available targets: ${Object.keys(this.adapters).join(", ")}`, 404);
    }

    // 0. Freshness window (spec FR-011).
    //
    // First, because it is the cheapest check there is — a string read and a
    // subtraction — and it stands in front of the most expensive thing an
    // unauthenticated caller can make us do (signature verification, and behind
    // it a full transaction deserialization). The pre-auth rate-limit charge
    // has already happened server-side; this is the first check on the payload
    // itself.
    //
    // It is also what gives the replay gate a floor: a signature we would still
    // accept must be one whose record we would still have. See
    // `input-freshness.ts` and the `statusRetentionTtlMs >= 4x` boot check.
    assertInputIsFresh(
      input.timestamp,
      this.config.maxInputAgeMs ?? DEFAULT_CONFIG_VALUES.maxInputAgeMs,
    );

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

    // The claimed identity is trustworthy from this point onward. HTTP callers
    // use this boundary to consume address-based and sponsor-global quotas;
    // doing so earlier lets a forged request poison somebody else's bucket.
    await onAuthenticated?.({ target });

    // 2. Adapter-Specific Input Validation (Pre-Queue)
    if (adapter && typeof adapter.validateInput === "function") {
      const validationResult = await adapter.validateInput(input);
      if (validationResult.valid) {
        // The adapter has now measured what this input really costs. Charge
        // the difference before anything is queued, so an expensive shape
        // cannot slip past on the flat unit it paid at authentication.
        //
        // Deliberately AFTER the validity check: refusing an input we already
        // rejected is not worth charging for, and a weight read off an invalid
        // payload is not a measurement worth trusting.
        const weight = validationResult.admissionWeight;
        if (typeof weight === "number" && weight > 1 && onAdmissionWeight) {
          await onAdmissionWeight({ target, weight, alreadyCharged: 1 });
        }
      }
      if (!validationResult.valid) {
        // Honour a status the adapter asked for. A gate that could not COMPLETE
        // — its own dependency was unavailable — reports 503, which is a
        // different claim from "your input is wrong" and is the only one a
        // caller can act on by retrying.
        throw new InputValidationError(
          validationResult.error || "Invalid input for target adapter",
          validationResult.statusCode ?? 400,
          validationResult.errorCode,
          validationResult.retryable,
        );
      }
    }

    // 3. Replay gate (spec FR-006b): never pay twice for one signed spend.
    //
    // After validation — an input we would refuse anyway is not worth a lookup,
    // and a replay key derived from a payload we have not judged is not a
    // measurement worth trusting — and before anything is queued.
    const replayKey = this.replayKeyFor(adapter, input, target);
    if (replayKey !== undefined && isTrackingStorage(this.storage)) {
      const known = await this.storage.findByReplayKey(replayKey);
      if (known) {
        // Not an error and not a refusal: the work is already tracked, so the
        // caller gets a 200 carrying the id that answers for it. Client retries
        // are therefore idempotent and free.
        console.log(
          `♻️ Duplicate submission from ${input.address} for target ${target}; ` +
            `returning the original request ${known.requestId.substring(0, 12)}… ` +
            `(state=${known.state}) without queueing it again.`,
        );
        await this.emitRequestEvent("request:accepted", {
          requestId: known.requestId,
          target,
          duplicate: true,
          time: Date.now(),
        });
        return { requestId: known.requestId, receipt: null, duplicate: true };
      }
    }

    // 4. Add to Storage (Only if all validation passes)
    //
    // Acceptance is the moment the promise in the spec is made: from here on
    // the request is either sent or reaches a terminal failure, and either way
    // its id resolves. Everything above this line can still refuse it, and a
    // refusal mints nothing at all (FR-001).
    const accepted = await this.acceptInput(input, target, replayKey);
    const requestId = accepted.requestId;
    await this.emitRequestEvent("request:accepted", {
      requestId,
      target,
      duplicate: accepted.duplicate === true,
      time: Date.now(),
    });
    if (accepted.duplicate) {
      // The pre-check above is a READ, so concurrent copies of one request all
      // pass it; the claim inside the acceptance transaction is what actually
      // stops the second. Same answer, arrived at one layer down.
      return { requestId, receipt: null, duplicate: true };
    }
    const { count, size } = await this.storage.getInputCountAndSize();
    console.log(
      `✅ Added input from ${input.address} to batch queue. Queue size: ${count} inputs, ${size} bytes`,
    );

    if (confirmationLevel === "no-wait") {
      return { requestId, receipt: null };
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
      return { requestId, receipt };
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
            requestId,
            receipt: { ...receipt, rollup: processingResult.rollup },
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

    return { requestId, receipt };
  }

  /**
   * Journal an accepted input, together with the record that answers for it.
   *
   * On a tracking backend this is ONE transaction (`recordAccepted` writes both
   * the queue row and the status), so there is no window in which a caller
   * holds an id for a request the store has never heard of — the `no-wait` +
   * immediate-poll race in the spec's edge cases.
   *
   * On a queue-only backend (`FileStorage`) the id is still computed and
   * returned; only the record is missing. Refusing to accept would punish a
   * deployment for a storage choice, and the id is exactly as valid — it is a
   * pure function of the payload. The server declines to advertise polling for
   * such a deployment.
   */
  private async acceptInput(
    input: T,
    target: string,
    replayKey?: string,
  ): Promise<{ requestId: string; duplicate: boolean }> {
    const requestId = computeRequestId(input, target);
    if (isTrackingStorage(this.storage)) {
      const outcome = await this.storage.recordAccepted(
        requestId,
        input,
        target,
        replayKey,
      );
      // On a duplicate the outcome carries the ORIGINAL request's id, not the
      // one computed above — that request is the one with a fate to report.
      return {
        requestId: outcome.requestId,
        duplicate: outcome.duplicate === true,
      };
    }
    await this.storage.addInput(input, target);
    return { requestId, duplicate: false };
  }

  /**
   * The replay key for an input, or `undefined` when none can be derived.
   *
   * `undefined` admits the input with no replay protection — deliberately, and
   * never a refusal (plan Q-P4). Failing closed here would break every custom
   * adapter written before the hook existed, and a batcher that refuses inputs
   * it cannot fingerprint is worse than one that occasionally pays twice for a
   * spend the chain will reject anyway. Logged once per target, because the
   * operator should know their deployment has no replay protection, and should
   * not learn it once per request.
   */
  private replayKeyFor(
    adapter: BlockchainAdapter<any>,
    input: T,
    target: string,
  ): string | undefined {
    const key = resolveReplayKey(adapter, input);
    if (key === undefined && !this.replayKeylessTargetsLogged.has(target)) {
      this.replayKeylessTargetsLogged.add(target);
      console.warn(
        `⚠️ [Batcher] Target "${target}" produced no replay key for an input ` +
          `(no signature, and its adapter supplies none). Submissions to this ` +
          `target are accepted WITHOUT duplicate protection — a resubmitted ` +
          `request will be balanced and paid for again. Implement ` +
          `getReplayKey() on the adapter to close this.`,
      );
    }
    return key;
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
    return this.waitForEffectStreamProcessedMqtt(target, receipt, timeout);
  }

  private async waitForEffectStreamProcessedMqtt(
    target: string,
    receipt: BlockchainTransactionReceipt,
    timeout: number,
  ): Promise<{ latestBlock: number; rollup: number } | null> {
    const adapter = this.adapters[target];
    const chainName = adapter.getSyncProtocolName?.() ??
      adapter.getChainName();

    let subscriptionReference: symbol | undefined = undefined;
    let latestBlock = 0;
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    try {
      const result = await Promise.race([
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Timeout")), timeout);
        }),
        new Promise<{ latestBlock: number; rollup: number }>(
          (resolve, reject) => {
            EventManager.Instance.subscribe(
              {
                topic: BuiltinEvents.SyncChains,
                filter: { chain: chainName, block: undefined },
              },
              (event) => {
                latestBlock = Math.max(event.block, latestBlock);
                if (latestBlock >= Number(receipt.blockNumber)) {
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
        EventManager.Instance.unsubscribe(subscriptionReference);
      }
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  // ── HTTP polling fallback (Bun — ws.createWebSocketStream unsupported) ────

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

  /**
   * Key under which a caller waits for its receipt.
   *
   * Same serialization as a storage row's identity and as the request id — see
   * `request-id.ts`. It has to be: the caller registers under this key with the
   * payload it submitted, and the processor looks it up with the row it read
   * back out of storage. Two hand-written copies of that string is one edit
   * away from a caller that waits forever.
   */
  private getInputCallbackKey(input: T): string {
    const target = input.target || this.defaultTarget;
    if (!target) {
      throw new Error(
        "Cannot generate callback key: no target specified and no default target configured.",
      );
    }
    return buildRequestKey(input, target);
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
    await this.emitStateTransitionAsync("poll:targets-ready", {
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
  /** Targets on an infra-failure cooldown are skipped until the deadline. */
  private readonly targetCooldownUntil = new Map<string, number>();

  /**
   * Pause batching for a target (inputs stay queued, retry counts untouched).
   * Used by the processor when a batch fails for INFRASTRUCTURE reasons —
   * charging an outage against per-input retry budgets deletes user inputs.
   */
  setTargetCooldown(target: string, ms: number): void {
    this.targetCooldownUntil.set(target, Date.now() + ms);
  }

  private async isTargetReadyForBatching(target: string): Promise<boolean> {
    if (!this.defaultTarget) {
      // This shouldn't happen after init(), but handle gracefully
      return false;
    }

    const cooldownUntil = this.targetCooldownUntil.get(target) ?? 0;
    if (cooldownUntil > Date.now()) return false;

    const adapter = this.adapters[target];

    // Adapters with per-wallet concurrency manage their own capacity.
    // As long as at least one wallet is free we should attempt a batch.
    if (adapter && typeof adapter.hasAvailableCapacity === "function") {
      if (!adapter.hasAvailableCapacity()) return false;
    } else {
      // Skip targets that are currently being processed to prevent concurrent batches
      // for the same target, which can cause UTXO/nonce conflicts.
      if (this.shutdownState.processingAdapters.has(target)) {
        return false;
      }
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
  async forceProcessBatches(target?: string): Promise<void> {
    if (this.shutdownState.isShuttingDown) {
      throw new Error("Cannot force process batches during shutdown");
    }

    if (target && !this.adapters[target]) {
      throw new Error(
        `Unknown target ${target}. Available: ${Object.keys(this.adapters).join(", ")}`,
      );
    }
    const allTargets = target ? [target] : Object.keys(this.adapters);
    console.log(
      target
        ? `🔧 Force processing batches for target ${target}...`
        : "🔧 Force processing batches for all targets...",
    );
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
  async clearPendingInputs(target?: string): Promise<number> {
    if (this.shutdownState.isShuttingDown) {
      throw new Error("Cannot clear pending inputs during shutdown");
    }

    if (!target) {
      const all = await this.storage.getAllInputs();
      await this.storage.clearAllInputs();
      return all.length;
    }
    if (!this.adapters[target]) {
      throw new Error(
        `Unknown target ${target}. Available: ${Object.keys(this.adapters).join(", ")}`,
      );
    }
    // Scoped wipe: only this product's rows, so a shared batcher's other
    // tenants keep their queues.
    const scoped = await this.storage.getInputsByTarget(target, this.defaultTarget!);
    if (scoped.length > 0) {
      await this.storage.removeProcessedInputs(scoped, target);
    }
    return scoped.length;
  }

  /**
   * Hold the HTTP port closed until every adapter that implements
   * `whenServable()` reports it is past its loop-blocking startup work.
   *
   * A refused connection is a better answer than a hung one: the client finds
   * out immediately instead of holding a socket open against a process that
   * cannot run a handler at all. Bounded by `httpServerReadinessTimeoutMs` and
   * never fatal — a gate that could stop the server from ever starting would be
   * a worse failure than the one it prevents.
   */
  private async waitForAdaptersServable(): Promise<void> {
    const gates: Promise<void>[] = [];
    for (const [target, adapter] of Object.entries(this.adapters)) {
      if (typeof adapter.whenServable !== "function") continue;
      try {
        gates.push(
          Promise.resolve(adapter.whenServable()).catch((error) => {
            console.warn(
              `⚠️ Adapter '${target}' failed to report readiness; ` +
                `treating it as ready to serve:`,
              error,
            );
          }),
        );
      } catch (error) {
        console.warn(
          `⚠️ Adapter '${target}' threw from whenServable(); ` +
            `treating it as ready to serve:`,
          error,
        );
      }
    }
    if (gates.length === 0) return;

    const timeoutMs = this.httpServerReadinessTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        Promise.all(gates).then(() => "ready" as const),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), timeoutMs);
          (timer as unknown as { unref?: () => void }).unref?.();
        }),
      ]);
      if (outcome === "timeout") {
        console.warn(
          `⚠️ Adapters did not report readiness within ${timeoutMs}ms; ` +
            `starting the HTTP server anyway. Requests may stall if an adapter ` +
            `is still blocking the event loop.`,
        );
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Start the HTTP server for the batcher
   * This provides REST API endpoints for interacting with the batcher
   *
   * Binding is held until every adapter is past its loop-blocking startup —
   * the wait lives HERE rather than in `init()` because there are three ways
   * to reach this method (`init()`, the Effection `runBatcher` path via
   * `runHttpServer()`, and a direct call), and a gate on only one of them
   * leaves the black hole open on the others.
   */
  async startHttpServer(): Promise<void> {
    if (this.httpServer) {
      console.log("⚠️ HTTP server already running");
      return;
    }

    await this.waitForAdaptersServable();

    try {
      this.httpServer = await startBatcherHttpServer(this, this.port);
      await this.emitStateTransitionAsync("http:start", {
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
      await this.emitStateTransitionAsync("http:stop", { time: Date.now() });
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

  getAdapter(target: string): BlockchainAdapter<any> | undefined {
    return this.adapters[target];
  }

  /**
   * Begin the periodic retention sweep (spec FR-007).
   *
   * Owned by the Batcher rather than the HTTP server, because tracking exists
   * without HTTP — `enableHttpServer: false` is a supported deployment, and
   * hanging retention off the server would leave exactly those batchers
   * growing without bound.
   *
   * The timer is `unref`ed where the runtime supports it: retention is
   * housekeeping, and an embedding process should be free to exit without
   * waiting for the next sweep. It is still cleared explicitly at shutdown —
   * unref stops it holding the process open, it does not stop it firing.
   */
  private startRetentionSweep(): void {
    if (this.retentionIntervalID) return;
    if (!isTrackingStorage(this.storage)) return;
    const storage = this.storage;
    if (typeof storage.pruneTerminal !== "function") {
      console.warn(
        `⚠️ [Batcher] Storage tracks requests but cannot prune them ` +
          `(no pruneTerminal). Terminal records will accumulate without bound.`,
      );
      return;
    }

    const intervalMs = this.config.statusPruneIntervalMs ??
      DEFAULT_CONFIG_VALUES.statusPruneIntervalMs;
    const keepCount = this.config.statusRetentionKeepCount ??
      DEFAULT_CONFIG_VALUES.statusRetentionKeepCount;
    const ttlMs = this.config.statusRetentionTtlMs ??
      DEFAULT_CONFIG_VALUES.statusRetentionTtlMs;

    this.retentionIntervalID = setInterval(() => {
      // Never let this reject into the timer. An unhandled rejection inside a
      // bare setInterval callback takes the PROCESS down, and a retention
      // hiccup must not be able to stop the batcher accepting work.
      void this.runRetentionSweep(keepCount, ttlMs);
    }, intervalMs);
    (this.retentionIntervalID as { unref?: () => void }).unref?.();
  }

  /**
   * One retention sweep. Failures are recorded and swallowed — the next tick
   * tries again, and the error is visible in `/queue-stats` rather than only in
   * a log line that scrolled past.
   */
  private async runRetentionSweep(
    keepCount: number,
    ttlMs: number,
  ): Promise<void> {
    const storage = this.storage as BatcherStorage<T> & {
      pruneTerminal?: (
        keepCount: number,
        ttlMs: number,
      ) => Promise<{ prunedByAge: number; prunedByCount: number }>;
    };
    if (typeof storage.pruneTerminal !== "function") return;
    try {
      const { prunedByAge, prunedByCount } = await storage.pruneTerminal(
        keepCount,
        ttlMs,
      );
      const pruned = prunedByAge + prunedByCount;
      this.retentionMetrics.prunedLastRun = pruned;
      this.retentionMetrics.prunedTotal += pruned;
      this.retentionMetrics.lastRunAt = new Date().toISOString();
      if (pruned > 0) {
        console.log(
          `🧹 [Batcher] Retention pruned ${pruned} terminal request record(s) ` +
            `(${prunedByAge} by age, ${prunedByCount} over the cap).`,
        );
      }
    } catch (error) {
      this.retentionMetrics.lastError = error instanceof Error
        ? error.message
        : String(error);
      console.error("[Batcher] Retention sweep failed:", error);
    }
  }

  /**
   * Run a retention sweep now, outside the schedule.
   *
   * Public so an operator (or a test) can force one without waiting out an
   * interval; the timer remains the normal path.
   */
  async pruneTerminalRecords(): Promise<void> {
    await this.runRetentionSweep(
      this.config.statusRetentionKeepCount ??
        DEFAULT_CONFIG_VALUES.statusRetentionKeepCount,
      this.config.statusRetentionTtlMs ??
        DEFAULT_CONFIG_VALUES.statusRetentionTtlMs,
    );
  }

  /** What retention is configured to do, and what it has done. */
  getRetentionStatus(): {
    enabled: boolean;
    keepCount: number;
    ttlMs: number;
    intervalMs: number;
    prunedLastRun: number;
    prunedTotal: number;
    lastRunAt?: string;
    lastError?: string;
  } {
    return {
      enabled: this.retentionIntervalID !== undefined,
      keepCount: this.config.statusRetentionKeepCount ??
        DEFAULT_CONFIG_VALUES.statusRetentionKeepCount,
      ttlMs: this.config.statusRetentionTtlMs ??
        DEFAULT_CONFIG_VALUES.statusRetentionTtlMs,
      intervalMs: this.config.statusPruneIntervalMs ??
        DEFAULT_CONFIG_VALUES.statusPruneIntervalMs,
      ...this.retentionMetrics,
    };
  }

  /**
   * What the last `init()` had to repair after an unclean stop, or undefined on
   * a backend that keeps no status. Counters moving after a restart are
   * evidence the previous process did not shut down cleanly.
   */
  getReconciliationReport(): ReconciliationReport | undefined {
    if (!isTrackingStorage(this.storage)) return undefined;
    return this.storage.getReconciliationReport();
  }

  /**
   * Can this batcher answer "what happened to request X"?
   *
   * False on a queue-only backend (`FileStorage`), which still queues, batches
   * and retries exactly as before but keeps no status record. The HTTP layer
   * asks this to decide whether to advertise polling at all: a registered
   * endpoint that always 404s would be worse than no endpoint, because a 404
   * is the same answer it gives for an id that genuinely expired.
   */
  isRequestTrackingEnabled(): boolean {
    return isTrackingStorage(this.storage);
  }

  /**
   * The tracked status of a request, or undefined if this batcher has no record
   * of it — never accepted, or accepted and since aged out of retention.
   *
   * Returns undefined rather than throwing on a queue-only backend, so a caller
   * does not have to branch on the storage type to ask a question.
   */
  async getRequestStatus(
    requestId: string,
  ): Promise<RequestStatusRecord | undefined> {
    if (!isTrackingStorage(this.storage)) return undefined;
    return await this.storage.getStatus(requestId);
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

  /** Stop the retention sweep. Idempotent; safe before `init()`. */
  private stopRetentionSweep(): void {
    if (this.retentionIntervalID) {
      clearInterval(this.retentionIntervalID);
      this.retentionIntervalID = undefined;
    }
  }

  /**
   * Cleanup additional resources (can be overridden by subclasses)
   */
  protected async cleanupResources(): Promise<void> {
    // Stop retention BEFORE the storage handle is released below. A sweep that
    // fires after `storage.close()` would run its DELETE against a closed
    // database — an error per interval, forever, from an object nobody
    // believes is still alive.
    this.stopRetentionSweep();

    // Give every adapter a chance to release process-wide resources. The
    // Midnight balancing adapter holds an exclusive claim on its wallet seeds;
    // without this, a batcher reconfigured or restarted inside one process can
    // never re-acquire them and construction throws on the second attempt.
    // A failing close must not block shutdown.
    for (const [target, adapter] of Object.entries(this.adapters)) {
      const close = (adapter as BlockchainAdapter<T>).close;
      if (typeof close !== "function") continue;
      try {
        await close.call(adapter);
      } catch (error) {
        console.error(`Error closing adapter for target ${target}:`, error);
      }
    }

    // The storage backend may hold a database handle. A file-backed queue has
    // nothing to release and does not implement this; a database one outlives
    // the batcher that owns it if nobody asks it to stop.
    try {
      await this.storage.close?.();
    } catch (error) {
      console.error("Error closing storage:", error);
    }
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
   * Process batches for specific targets.
   *
   * For adapters with `hasAvailableCapacity`, batch processing is launched
   * concurrently (via Promise, not awaited in the loop) so the polling
   * interval can immediately start the next batch on a free wallet.
   * Other adapters keep the original sequential behavior.
   *
   * @param targetsToProcess - Array of target names to process batches for
   */
  async processBatchesForTargets(targetsToProcess: string[]): Promise<void> {
    if (this.shutdownState.isShuttingDown) return;

    if (targetsToProcess.length === 0) {
      return;
    }

    const concurrentPromises: Promise<void>[] = [];

    for (const target of targetsToProcess) {
      const adapter = this.adapters[target];
      if (!adapter) {
        console.error(`No adapter available for target: ${target}`);
        continue;
      }

      // Get inputs for this specific target
      if (!this.defaultTarget) {
        console.error(
          `Cannot process batches: no default target configured.`,
        );
        continue;
      }

      const supportsConcurrent =
        typeof adapter.hasAvailableCapacity === "function";

      // Atomic check-and-reserve: prevents two concurrent polls from both
      // picking up the same inputs and submitting duplicate transactions.
      // Concurrent-capable adapters manage their own reservation in buildBatchData.
      if (!supportsConcurrent) {
        if (this.shutdownState.processingAdapters.has(target)) {
          continue;
        }
        this.shutdownState.processingAdapters.add(target);
      }

      const targetInputs = await this.storage.getInputsByTarget(
        target,
        this.defaultTarget,
      );

      if (targetInputs.length === 0) {
        if (!supportsConcurrent) {
          this.shutdownState.processingAdapters.delete(target);
        }
        continue;
      }

      if (supportsConcurrent) {
        // Fire-and-forget: the adapter manages wallet/input reservations.
        this.shutdownState.processingAdapters.add(target);
        const promise = this.batchProcessor
          .processBatchForTarget(adapter, target, targetInputs)
          .then(() => {
            this.lastProcessTime.set(target, Date.now());
          })
          .catch(async (error) => {
            console.error(
              `Error processing concurrent batch for target ${target}:`,
              error,
            );
            await this.emitStateTransitionAsync("error", {
              phase: "batch",
              target,
              error,
              time: Date.now(),
            });
          })
          .finally(() => {
            const idle = typeof adapter.isFullyIdle === "function"
              ? adapter.isFullyIdle()
              : adapter.hasAvailableCapacity!();
            if (idle) {
              this.shutdownState.processingAdapters.delete(target);
            }
          });
        concurrentPromises.push(promise);
      } else {
        // Sequential path. processingAdapters was already added above.
        try {
          await this.emitStateTransitionAsync("batch:process:start", {
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
            `Error processing batch for target ${target}:`,
            error,
          );
          await this.emitStateTransitionAsync("error", {
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

    // Don't block the caller on concurrent batches — they run in the background.
    // Errors are already handled per-promise above.
    if (concurrentPromises.length > 0) {
      Promise.all(concurrentPromises).catch(() => {
        // Errors handled individually above
      });
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
   * When the adapter implements `hasAvailableCapacity`, batch processing is
   * spawned concurrently (fire-and-forget) so the poll loop can immediately
   * start the next batch on a different wallet. Without this method the
   * original sequential (one-batch-at-a-time) behavior is preserved.
   *
   * @param target - The adapter target name to poll for
   */
  *runAdapterPollingLoop(target: string): Operation<void> {
    const adapter = this.adapters[target];
    const supportsConcurrent = typeof adapter.hasAvailableCapacity === "function";

    while (true) {
      yield* sleep(this.config.pollingIntervalMs);

      if (this.shutdownState.isShuttingDown) return;

      const isReady = yield* call(() => this.isTargetReadyForBatching(target));
      if (!isReady) continue;

      const targetInputs = yield* call(() =>
        this.storage.getInputsByTarget(target, this.defaultTarget!)
      );
      if (targetInputs.length === 0) continue;

      if (supportsConcurrent) {
        // ---- Concurrent path ----
        // The adapter's buildBatchData handles wallet/input reservation
        // internally, so we can spawn and immediately loop back to poll.
        yield* this.emitStateTransition("batch:process:start", {
          target,
          inputCount: targetInputs.length,
          time: Date.now(),
        });

        this.shutdownState.processingAdapters.add(target);
        const batcher = this; // capture for the spawned generator
        yield* spawn(function* () {
          try {
            yield* call(() =>
              batcher.batchProcessor.processBatchForTarget(
                adapter,
                target,
                targetInputs
              )
            );
            batcher.lastProcessTime.set(target, Date.now());
          } catch (error) {
            console.error(`Error processing concurrent batch for target ${target}:`, error);
            yield* batcher.emitStateTransition("error", {
              phase: "batch",
              target,
              error,
              time: Date.now(),
            });
          } finally {
            // Clear the processingAdapters flag only when ALL concurrent
            // batches are done (fully idle). If another spawned batch is
            // still running, keep the flag so shutdown waits.
            const idle = typeof adapter.isFullyIdle === "function"
              ? adapter.isFullyIdle()
              : adapter.hasAvailableCapacity!();
            if (idle) {
              batcher.shutdownState.processingAdapters.delete(target);
            }
          }
        });
      } else {
        // ---- Sequential path ----
        // Atomic check-and-reserve to avoid racing other polls on the same target.
        if (this.shutdownState.processingAdapters.has(target)) {
          continue;
        }
        this.shutdownState.processingAdapters.add(target);

        try {
          yield* this.emitStateTransition("batch:process:start", {
            target,
            inputCount: targetInputs.length,
            time: Date.now(),
          });

          yield* call(() =>
            this.batchProcessor.processBatchForTarget(
              adapter,
              target,
              targetInputs
            )
          );

          this.lastProcessTime.set(target, Date.now());
        } catch (error) {
          console.error(`Error processing batch for target ${target}:`, error);
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
    // Install a global handler so that transient network errors (e.g.
    // "Failed to fetch: request body stream errored") do not crash the
    // process.  These originate from internal HTTP stream promises in
    // viem / midnight-sdk that are not chained to the outer `await`.
    globalThis.addEventListener("unhandledrejection", (event) => {
      event.preventDefault();
      console.error(
        "⚠️ [Batcher] Caught unhandled promise rejection (non-fatal):",
        event.reason,
      );
    });

    // 1. Validate adapters before initialization
    validatePreInit(this.adapters, this.defaultTarget);

    // 2. Initialize last process times for all adapters at startup
    const now = Date.now();
    for (const target of Object.keys(this.adapters)) {
      this.lastProcessTime.set(target, now);
    }

    // 3. Perform sequential setup tasks
    yield* call(() => this.storage.init(this.defaultTarget));

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
