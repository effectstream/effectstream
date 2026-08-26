import { constants as osConstants } from "node:os";
import { call, run, type Operation, type Task } from "effection";
import {
  withEffectstreamStaticConfig,
  type EffectstreamStaticConfig,
} from "@effectstream/config";
import { init, start } from "./main.ts";
import type { StartConfig } from "./types.ts";

const EMPTY_FAILURES: readonly unknown[] = Object.freeze([]);
const DEFAULT_PROCESS_SIGNALS: readonly NodeJS.Signals[] = Object.freeze([
  "SIGINT",
  "SIGTERM",
]);

type ProcessState = "UNUSED" | "RUNNING" | "FINISHED";
let processState: ProcessState = "UNUSED";

export type RunEffectstreamOptions = {
  staticConfig: EffectstreamStaticConfig;
  startConfig: StartConfig;
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
} {
  if (options == null || typeof options !== "object") {
    throw invalid("runEffectstream options must be an object");
  }
  if (options.staticConfig == null || typeof options.staticConfig !== "object") {
    throw invalid("staticConfig must be an object");
  }
  if (options.startConfig == null || typeof options.startConfig !== "object") {
    throw invalid("startConfig must be an object");
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
  return { signals: Object.freeze(signals), signal };
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

function* execute(options: RunEffectstreamOptions): Operation<void> {
  try {
    yield* call(function* () {
      yield* init();
      yield* withEffectstreamStaticConfig(options.staticConfig, function* () {
        yield* start(options.startConfig);
      });
    });
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
    task = run(() => execute(options));
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
      taskFailureWasBoundary = error instanceof BoundaryFailure;
      taskFailure = taskFailureWasBoundary ? error.error : error;
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
      ...(taskRejected && !suppressTerminalHalt ? [taskFailure] : []),
      ...(haltRejected ? [haltFailure] : []),
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
