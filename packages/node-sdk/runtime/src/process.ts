import { constants as osConstants } from "node:os";
import { call, ensure, run, type Operation, type Task, until } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
  type EffectstreamStaticConfig,
} from "@effectstream/config";
import { init, startCanonical } from "./main.ts";
import type {
  StartConfig,
  StartConfigApiRouter,
  VERSION,
} from "./types.ts";
import type { StateMachine } from "@effectstream/sm";
import {
  startPglite,
  type PgliteHandle,
} from "@effectstream/db/start-pglite";
import {
  overlayRunEffectstreamEnvironment,
  restoreRunEffectstreamEnvironment,
  snapshotRunEffectstreamEnvironment,
  type RunEffectstreamEnvSnapshot,
} from "./environment-overlay.ts";

const EMPTY_FAILURES: readonly unknown[] = Object.freeze([]);
const DEFAULT_PROCESS_SIGNALS: readonly NodeJS.Signals[] = Object.freeze([
  "SIGINT",
  "SIGTERM",
]);

type ProcessState = "UNUSED" | "RUNNING" | "FINISHED";
let processState: ProcessState = "UNUSED";

export type RunEffectstreamDatabase =
  | { type: "pglite"; dataDir?: string; port?: number }
  | {
    type: "postgres";
    host: string;
    port: number;
    user: string;
    database: string;
    password?: string;
  };

type BuiltEffectstreamConfig = Parameters<
  typeof toSyncProtocolWithNetwork
>[0];

export type RunEffectstreamOptions = {
  appName: string;
  appVersion: VERSION;
  config: BuiltEffectstreamConfig;
  stateMachine: StateMachine<any, any, any>;
  apiRouter: StartConfigApiRouter;
  database?: RunEffectstreamDatabase;
  messaging?: boolean;
  signal?: AbortSignal;
  processSignals?: false | readonly NodeJS.Signals[];
};

export type RunEffectstreamErrorCode =
  | "INVALID_OPTIONS"
  | "ALREADY_RUNNING"
  | "ALREADY_USED"
  | "ABORTED"
  | "RUN_FAILED";

export class RunEffectstreamError extends Error {
  readonly code: RunEffectstreamErrorCode;
  readonly failures: readonly unknown[];
  override readonly cause?: unknown;

  constructor(
    code: RunEffectstreamErrorCode,
    message: string,
    options: { cause?: unknown; failures?: readonly unknown[] } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "RunEffectstreamError";
    this.code = code;
    this.cause = options.cause;
    this.failures = options.failures ?? EMPTY_FAILURES;
  }
}

class BoundaryFailure {
  constructor(readonly error: unknown) {}
}

type Cancellation =
  | { type: "process"; signal: NodeJS.Signals }
  | { type: "abort"; reason: unknown };

function invalid(message: string, cause?: unknown): RunEffectstreamError {
  return new RunEffectstreamError("INVALID_OPTIONS", message, { cause });
}

function validateOptions(options: RunEffectstreamOptions): {
  signals: readonly NodeJS.Signals[];
  signal?: AbortSignal;
  database: RunEffectstreamDatabase;
  staticConfig: EffectstreamStaticConfig;
  startConfig: StartConfig;
} {
  if (options == null || typeof options !== "object") {
    throw invalid("runEffectstream options must be an object");
  }

  const allowedKeys = new Set([
    "appName",
    "appVersion",
    "config",
    "stateMachine",
    "apiRouter",
    "database",
    "messaging",
    "signal",
    "processSignals",
  ]);
  const unknownKeys = Object.keys(options).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw invalid(`runEffectstream contains unsupported option${unknownKeys.length === 1 ? "" : "s"}: ${unknownKeys.join(", ")}`);
  }
  if (typeof options.appName !== "string" || options.appName.length === 0) {
    throw invalid("appName must be a nonempty string");
  }
  if (
    typeof options.appVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(options.appVersion)
  ) {
    throw invalid("appVersion must use numeric major.minor.patch format");
  }
  if (options.config == null || typeof options.config !== "object") {
    throw invalid("config must be a built ConfigBuilder object");
  }
  if (
    options.stateMachine == null ||
    typeof options.stateMachine !== "object" ||
    typeof options.stateMachine.bindGrammar !== "function" ||
    typeof options.stateMachine.processInput !== "function"
  ) {
    throw invalid("stateMachine must be a StateMachine instance");
  }
  if (typeof options.apiRouter !== "function") {
    throw invalid("apiRouter must be a function");
  }
  if (options.messaging !== undefined && typeof options.messaging !== "boolean") {
    throw invalid("messaging must be a boolean");
  }

  const signal = options.signal;
  if (
    signal !== undefined &&
    (typeof signal !== "object" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function" ||
      typeof signal.aborted !== "boolean")
  ) {
    throw invalid("signal must be an AbortSignal");
  }

  const configured = options.processSignals;
  if (configured !== undefined && configured !== false && !Array.isArray(configured)) {
    throw invalid("processSignals must be false or an array of signals");
  }

  const requested = configured === false
    ? []
    : configured ?? DEFAULT_PROCESS_SIGNALS;
  const validSignals = osConstants.signals as Readonly<Record<string, number>>;
  const seen = new Set<NodeJS.Signals>();
  const signals: NodeJS.Signals[] = [];
  for (const candidate of requested) {
    if (
      typeof candidate !== "string" ||
      candidate === "SIGKILL" ||
      candidate === "SIGSTOP" ||
      !(candidate in validSignals)
    ) {
      throw invalid(`processSignals contains an unsupported signal: ${String(candidate)}`);
    }
    const signalName = candidate as NodeJS.Signals;
    if (!seen.has(signalName)) {
      seen.add(signalName);
      signals.push(signalName);
    }
  }

  const database = options.database ?? { type: "pglite" as const };
  if (database == null || typeof database !== "object") {
    throw invalid("database must be a PGlite or PostgreSQL configuration");
  }
  if (database.type === "pglite") {
    const keys = Object.keys(database);
    if (keys.some((key) => !["type", "dataDir", "port"].includes(key))) {
      throw invalid("PGlite database contains unsupported fields");
    }
    if (
      Object.prototype.hasOwnProperty.call(database, "dataDir") &&
      typeof database.dataDir !== "string"
    ) {
      throw invalid("PGlite dataDir must be a string when supplied");
    }
    if (
      database.port !== undefined &&
      (!Number.isSafeInteger(database.port) || database.port < 0 || database.port > 65_535)
    ) {
      throw invalid("PGlite port must be an integer from 0 through 65535");
    }
  } else if (database.type === "postgres") {
    const keys = Object.keys(database);
    if (
      keys.some((key) =>
        !["type", "host", "port", "user", "database", "password"].includes(key)
      )
    ) {
      throw invalid("PostgreSQL database contains unsupported fields");
    }
    for (const key of ["host", "user", "database"] as const) {
      if (typeof database[key] !== "string" || database[key].length === 0) {
        throw invalid(`PostgreSQL ${key} must be a nonempty string`);
      }
    }
    if (
      !Number.isSafeInteger(database.port) ||
      database.port <= 0 ||
      database.port > 65_535
    ) {
      throw invalid("PostgreSQL port must be an integer from 1 through 65535");
    }
    if (
      Object.prototype.hasOwnProperty.call(database, "password") &&
      typeof database.password !== "string"
    ) {
      throw invalid("PostgreSQL password must be a string when supplied");
    }
  } else {
    throw invalid("database.type must be pglite or postgres");
  }

  let syncInfo;
  try {
    syncInfo = toSyncProtocolWithNetwork(options.config);
  } catch (error) {
    throw invalid("config must be a complete built ConfigBuilder object", error);
  }
  const staticConfig: EffectstreamStaticConfig = {
    securityNamespace: options.config.securityNamespace ?? options.appName,
    allNetworks: options.config.allNetworks,
  };
  const startConfig: StartConfig = {
    appName: options.appName,
    appVersion: options.appVersion,
    syncInfo,
    apiRouter: options.apiRouter,
    events: options.messaging === true,
  };

  return {
    signals: Object.freeze(signals),
    signal,
    database,
    staticConfig,
    startConfig,
  };
}

function isCanonicalHalt(error: unknown): boolean {
  return error instanceof Error && error.name === "Error" && error.message === "halted";
}

function uniqueFailures(values: readonly unknown[]): readonly unknown[] {
  const failures: unknown[] = [];
  for (const value of values) {
    if (!failures.some((existing) => Object.is(existing, value))) failures.push(value);
  }
  return Object.freeze(failures);
}

function failureItems(error: unknown): unknown[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap((entry) => failureItems(entry));
  }
  return [error];
}

function originalNonempty(
  snapshot: RunEffectstreamEnvSnapshot,
  key: "PGLITE_DATA_DIR" | "DB_USER" | "DB_NAME",
  fallback: string,
): string {
  const value = snapshot[key].value;
  return value !== undefined && value.length > 0 ? value : fallback;
}

function applyResourceOverlay(
  database: RunEffectstreamDatabase,
  messaging: boolean,
  snapshot: RunEffectstreamEnvSnapshot,
): void {
  if (database.type === "pglite") {
    const hasDataDir = Object.prototype.hasOwnProperty.call(database, "dataDir");
    overlayRunEffectstreamEnvironment({
      PGLITE: "true",
      PGLITE_DATA_DIR: hasDataDir
        ? database.dataDir!
        : originalNonempty(snapshot, "PGLITE_DATA_DIR", "memory://"),
      DB_HOST: "127.0.0.1",
      DB_PORT: undefined,
      DB_USER: originalNonempty(snapshot, "DB_USER", "postgres"),
      DB_NAME: originalNonempty(snapshot, "DB_NAME", "postgres"),
      DB_PW: undefined,
      MQTT_BROKER: messaging ? "true" : "false",
    });
    return;
  }

  overlayRunEffectstreamEnvironment({
    PGLITE: "false",
    PGLITE_DATA_DIR: undefined,
    DB_HOST: database.host,
    DB_PORT: String(database.port),
    DB_USER: database.user,
    DB_NAME: database.database,
    DB_PW: Object.prototype.hasOwnProperty.call(database, "password")
      ? database.password!
      : undefined,
    MQTT_BROKER: messaging ? "true" : "false",
  });
}

type PgliteAcquisition =
  | { ok: true; handle: PgliteHandle }
  | { ok: false; error: unknown };

type RuntimeOutcome =
  | { ok: true }
  | { ok: false; error: unknown };

function* executeOwned(
  options: RunEffectstreamOptions,
  validated: ReturnType<typeof validateOptions>,
): Operation<void> {
  const snapshot = snapshotRunEffectstreamEnvironment();
  let acquisition: Promise<PgliteAcquisition> | undefined;
  let acquisitionConsumed = false;
  let pglite: PgliteHandle | undefined;
  let runtimeTask: Task<void> | undefined;
  let runtimeOutcome: Promise<RuntimeOutcome> | undefined;
  let runtimeOutcomeConsumed = false;
  let primaryFailure: unknown;
  let primaryFailed = false;
  const cleanupFailures: unknown[] = [];

  // Effection resource finalizers are cancellation-safe. An ordinary generator
  // `finally` can itself be interrupted while awaiting delayed cleanup, which
  // would restore neither failure-winner semantics nor the owned environment.
  yield* ensure(function* () {
    if (runtimeTask && runtimeOutcome && !runtimeOutcomeConsumed) {
      // Let a runtime failure already propagating in the cancellation turn win
      // before actively halting an otherwise-live runtime. This preserves the
      // existing child-failure-over-racing-abort contract without delaying a
      // steady-state shutdown beyond one event-loop turn.
      const beforeHalt = yield* until(Promise.race([
        runtimeOutcome.then((outcome) => ({ settled: true as const, outcome })),
        new Promise<{ settled: false }>((resolve) => {
          setTimeout(() => resolve({ settled: false }), 0);
        }),
      ]));
      if (beforeHalt.settled) {
        runtimeOutcomeConsumed = true;
        if (!beforeHalt.outcome.ok) {
          cleanupFailures.push(...failureItems(beforeHalt.outcome.error));
        }
      }
    }
    if (runtimeTask && runtimeOutcome && !runtimeOutcomeConsumed) {
      try {
        yield* until(Promise.resolve(runtimeTask.halt()));
      } catch (error) {
        cleanupFailures.push(...failureItems(error));
      }
      const outcome = yield* until(runtimeOutcome);
      runtimeOutcomeConsumed = true;
      if (!outcome.ok && !isCanonicalHalt(outcome.error)) {
        cleanupFailures.push(...failureItems(outcome.error));
      }
    }
    if (acquisition && !pglite) {
      const outcome = yield* until(acquisition);
      if (outcome.ok) pglite = outcome.handle;
      else if (!acquisitionConsumed) cleanupFailures.push(outcome.error);
    }
    if (pglite) {
      try {
        // The runtime task above owns and closes its pool first.
        yield* until(pglite.close({ force: true }));
      } catch (error) {
        cleanupFailures.push(...failureItems(error));
      }
    }
    try {
      restoreRunEffectstreamEnvironment(snapshot);
    } catch (error) {
      cleanupFailures.push(...failureItems(error));
    }

    const failures = uniqueFailures([
      ...(primaryFailed ? failureItems(primaryFailure) : []),
      ...cleanupFailures,
    ]);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(
        [...failures],
        "Effectstream runtime and resource cleanup failed",
      );
    }
  });

  try {
    applyResourceOverlay(
      validated.database,
      options.messaging === true,
      snapshot,
    );
    if (validated.database.type === "pglite") {
      acquisition = startPglite(validated.database.port ?? 0).then(
        (handle) => ({ ok: true as const, handle }),
        (error) => ({ ok: false as const, error }),
      );
      const outcome = yield* until(acquisition);
      acquisitionConsumed = true;
      if (!outcome.ok) throw outcome.error;
      pglite = outcome.handle;
      overlayRunEffectstreamEnvironment({
        DB_HOST: "127.0.0.1",
        DB_PORT: String(pglite.port),
      });
    }

    // The runtime task owns telemetry, broker, HTTP, and its pool. Keeping its
    // task handle lets cancellation explicitly halt and await those finalizers
    // before the outer owner closes PGlite and restores the environment.
    runtimeTask = run(function* () {
      yield* init();
      yield* withEffectstreamStaticConfig(validated.staticConfig, function* () {
        yield* startCanonical(validated.startConfig, options.stateMachine);
      });
    });
    runtimeOutcome = Promise.resolve(runtimeTask).then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error }),
    );
    const outcome = yield* until(runtimeOutcome);
    runtimeOutcomeConsumed = true;
    if (!outcome.ok) throw outcome.error;
  } catch (error) {
    primaryFailed = true;
    primaryFailure = error;
  }
}

function* execute(
  options: RunEffectstreamOptions,
  validated: ReturnType<typeof validateOptions>,
): Operation<void> {
  try {
    yield* call(() => executeOwned(options, validated));
  } catch (error) {
    // The catch must surround yield* call(...): descendant failures reject the
    // call boundary itself and can bypass catches inside its child operation.
    throw new BoundaryFailure(error);
  }
}

/**
 * Run one Effectstream node as a process-wide, one-shot Promise.
 *
 * The first configured process signal requests a controlled shutdown. Caller
 * cancellation rejects with `ABORTED`. Any surfaced runtime or cleanup failure
 * rejects with `RUN_FAILED` and takes priority over cancellation.
 */
export function runEffectstream(options: RunEffectstreamOptions): Promise<void> {
  let validated: ReturnType<typeof validateOptions>;
  try {
    validated = validateOptions(options);
  } catch (error) {
    return Promise.reject(
      error instanceof RunEffectstreamError
        ? error
        : invalid("runEffectstream options are invalid", error),
    );
  }

  if (validated.signal?.aborted) {
    return Promise.reject(new RunEffectstreamError(
      "ABORTED",
      "Effectstream startup was aborted",
      { cause: validated.signal.reason },
    ));
  }
  if (processState === "RUNNING") {
    return Promise.reject(new RunEffectstreamError(
      "ALREADY_RUNNING",
      "runEffectstream is already running in this process",
    ));
  }
  if (processState === "FINISHED") {
    return Promise.reject(new RunEffectstreamError(
      "ALREADY_USED",
      "runEffectstream has already been used in this process",
    ));
  }

  let cancellation: Cancellation | undefined;
  let task: Task<void> | undefined;
  let haltPromise: Promise<void> | undefined;
  const installedSignals: Array<[NodeJS.Signals, () => void]> = [];

  const requestHalt = (): void => {
    if (!task || haltPromise) return;
    haltPromise = Promise.resolve(task.halt());
    // Install a rejection observer immediately, before the public flow awaits it.
    void haltPromise.catch(() => {});
  };
  const cancel = (winner: Cancellation): void => {
    if (cancellation) return;
    cancellation = winner;
    requestHalt();
  };
  const abortListener = (): void => {
    cancel({ type: "abort", reason: validated.signal?.reason });
  };

  try {
    for (const signalName of validated.signals) {
      const listener = () => cancel({ type: "process", signal: signalName });
      process.on(signalName, listener);
      installedSignals.push([signalName, listener]);
    }
    validated.signal?.addEventListener("abort", abortListener, { once: true });
    if (validated.signal?.aborted) {
      throw new RunEffectstreamError(
        "ABORTED",
        "Effectstream startup was aborted",
        { cause: validated.signal.reason },
      );
    }
  } catch (error) {
    for (const [signalName, listener] of installedSignals) {
      process.removeListener(signalName, listener);
    }
    validated.signal?.removeEventListener("abort", abortListener);
    return Promise.reject(
      error instanceof RunEffectstreamError
        ? error
        : invalid("Unable to install cancellation listeners", error),
    );
  }

  processState = "RUNNING";
  try {
    task = run(() => execute(options, validated));
    // A signal can arrive after listener acquisition but before task assignment.
    if (cancellation) requestHalt();
  } catch (error) {
    processState = "FINISHED";
    for (const [signalName, listener] of installedSignals) {
      process.removeListener(signalName, listener);
    }
    validated.signal?.removeEventListener("abort", abortListener);
    const failure = error instanceof BoundaryFailure ? error.error : error;
    const failures = uniqueFailures([failure]);
    return Promise.reject(new RunEffectstreamError(
      "RUN_FAILED",
      "Effectstream failed to start",
      { cause: failures[0], failures },
    ));
  }

  return (async () => {
    let taskFailure: unknown;
    let taskRejected = false;
    let taskFailureWasBoundary = false;
    let haltFailure: unknown;
    let haltRejected = false;
    try {
      await task;
    } catch (error) {
      taskRejected = true;
      if (error instanceof BoundaryFailure) {
        taskFailureWasBoundary = true;
        taskFailure = error.error;
      } else {
        taskFailure = error;
      }
    }
    if (haltPromise) {
      try {
        await haltPromise;
      } catch (error) {
        haltRejected = true;
        haltFailure = error;
      }
    }

    const suppressTerminalHalt = taskRejected && cancellation !== undefined &&
      !haltRejected && !taskFailureWasBoundary && isCanonicalHalt(taskFailure);
    const failures = uniqueFailures([
      ...(taskRejected && !suppressTerminalHalt
        ? failureItems(taskFailure)
        : []),
      ...(haltRejected ? failureItems(haltFailure) : []),
    ]);
    if (failures.length > 0) {
      throw new RunEffectstreamError(
        "RUN_FAILED",
        "Effectstream runtime or cleanup failed",
        { cause: failures[0], failures },
      );
    }
    if (cancellation?.type === "abort") {
      throw new RunEffectstreamError(
        "ABORTED",
        "Effectstream was aborted",
        { cause: cancellation.reason },
      );
    }
  })().finally(() => {
    processState = "FINISHED";
    for (const [signalName, listener] of installedSignals) {
      process.removeListener(signalName, listener);
    }
    validated.signal?.removeEventListener("abort", abortListener);
  });
}
