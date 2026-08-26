import assert from "node:assert/strict";
import { mock } from "bun:test";
import { ensure, sleep, spawn, suspend } from "effection";

const scenario = process.argv[2];
const startupError = new Error("startup failed");
const childHaltedError = new Error("halted");
const cleanupError = new Error("cleanup failed");
const ordinaryReasonError = new Error("ordinary rejection reason");
let cleanupCount = 0;
let raceAbort: (() => void) | undefined;

function selectedRejectionReason(): unknown {
  switch (process.argv[3]) {
    case "undefined": return undefined;
    case "null": return null;
    case "false": return false;
    case "zero": return 0;
    case "empty": return "";
    case "error": return ordinaryReasonError;
    default: throw new Error(`Unknown rejection reason: ${process.argv[3]}`);
  }
}

mock.module("../src/main.ts", () => ({
  init: function* () {
    if (scenario === "startup-failure") throw startupError;
  },
  start: function* () {
    if (scenario === "normal" || scenario === "invalid" ||
      scenario === "already-aborted" || scenario === "abort-race" ||
      scenario === "listener-failure") return;
    if (scenario === "child-halted") throw childHaltedError;
    if (scenario === "runtime-reason") throw selectedRejectionReason();
    if (scenario === "child-halted-race") {
      yield* spawn(function* () {
        yield* sleep(10);
        // Queue cancellation before throwing. The descendant error rejects the
        // enclosing call boundary in this turn; the queued abort then requests
        // a successful halt of the already-failed task.
        queueMicrotask(() => raceAbort?.());
        throw childHaltedError;
      });
    }
    if (scenario === "cleanup-failure" || scenario === "cleanup-reason" ||
      scenario === "repeat-signal") {
      yield* ensure(function* () {
        cleanupCount++;
        if (scenario === "repeat-signal") yield* sleep(30);
        if (scenario === "cleanup-failure") throw cleanupError;
        if (scenario === "cleanup-reason") throw selectedRejectionReason();
      });
    }
    yield* suspend();
  },
}));
mock.module("@effectstream/config", () => ({
  withEffectstreamStaticConfig: function* (
    _config: unknown,
    continuation: () => Generator,
  ) {
    yield* continuation();
  },
}));

const {
  runEffectstream,
  RunEffectstreamError,
} = await import("../src/process.ts");

const options = {
  staticConfig: {
    securityNamespace: {} as never,
    allNetworks: { viemNetworks: {} },
  },
  startConfig: {
    appName: "runtime-process-test",
    appVersion: "1.0.0" as const,
    syncInfo: [],
  },
};

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof RunEffectstreamError);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`Expected ${code}`);
}

switch (scenario) {
  case "normal": {
    await runEffectstream({ ...options, processSignals: false });
    await expectCode(
      runEffectstream({ ...options, processSignals: false }),
      "ALREADY_USED",
    );
    break;
  }
  case "invalid": {
    const error = await expectCode(
      runEffectstream({
        ...options,
        processSignals: ["SIGKILL"] as readonly NodeJS.Signals[],
      }),
      "INVALID_OPTIONS",
    );
    assert(Object.isFrozen(error.failures));
    assert.deepEqual(error.failures, []);
    await runEffectstream({ ...options, processSignals: false });
    break;
  }
  case "already-aborted": {
    const controller = new AbortController();
    const reason = new Error("not starting");
    controller.abort(reason);
    const error = await expectCode(
      runEffectstream({ ...options, signal: controller.signal }),
      "ABORTED",
    );
    assert.equal(error.cause, reason);
    assert.deepEqual(error.failures, []);
    await runEffectstream({ ...options, processSignals: false });
    break;
  }
  case "abort-race": {
    const reason = new Error("raced abort");
    const signal = {
      aborted: false,
      reason: undefined as unknown,
      addEventListener() {
        this.aborted = true;
        this.reason = reason;
      },
      removeEventListener() {},
    } as unknown as AbortSignal;
    const error = await expectCode(
      runEffectstream({ ...options, signal }),
      "ABORTED",
    );
    assert.equal(error.cause, reason);
    await runEffectstream({ ...options, processSignals: false });
    break;
  }
  case "listener-failure": {
    const originalOn = process.on;
    const before = process.listenerCount("SIGINT");
    process.on = function (event: string | symbol, listener: (...args: any[]) => void) {
      if (event === "SIGTERM") throw new Error("listener acquisition failed");
      return originalOn.call(process, event, listener);
    } as typeof process.on;
    try {
      await expectCode(runEffectstream(options), "INVALID_OPTIONS");
    } finally {
      process.on = originalOn;
    }
    assert.equal(process.listenerCount("SIGINT"), before);
    await runEffectstream({ ...options, processSignals: false });
    break;
  }
  case "startup-failure": {
    const error = await expectCode(
      runEffectstream({ ...options, processSignals: false }),
      "RUN_FAILED",
    );
    assert.equal(error.cause, startupError);
    assert.deepEqual(error.failures, [startupError]);
    assert(Object.isFrozen(error.failures));
    break;
  }
  case "child-halted": {
    const error = await expectCode(
      runEffectstream({ ...options, processSignals: false }),
      "RUN_FAILED",
    );
    assert.equal(error.cause, childHaltedError);
    assert.deepEqual(error.failures, [childHaltedError]);
    break;
  }
  case "child-halted-race": {
    const controller = new AbortController();
    raceAbort = () => controller.abort(new Error("race cancellation"));
    const promise = runEffectstream({
      ...options,
      processSignals: false,
      signal: controller.signal,
    });
    const error = await expectCode(promise, "RUN_FAILED");
    assert.equal(controller.signal.aborted, true);
    assert.equal(error.cause, childHaltedError);
    assert.deepEqual(error.failures, [childHaltedError]);
    break;
  }
  case "runtime-reason": {
    const reason = selectedRejectionReason();
    const error = await expectCode(
      runEffectstream({ ...options, processSignals: false }),
      "RUN_FAILED",
    );
    assert.equal(error.failures.length, 1);
    assert(Object.is(error.failures[0], reason));
    assert(Object.is(error.cause, reason));
    break;
  }
  case "external-abort": {
    const controller = new AbortController();
    const reason = { source: "supervisor" };
    const promise = runEffectstream({
      ...options,
      processSignals: false,
      signal: controller.signal,
    });
    controller.abort(reason);
    const error = await expectCode(promise, "ABORTED");
    assert.equal(error.cause, reason);
    assert.deepEqual(error.failures, []);
    break;
  }
  case "cleanup-failure": {
    const controller = new AbortController();
    const promise = runEffectstream({
      ...options,
      processSignals: false,
      signal: controller.signal,
    });
    controller.abort();
    const error = await expectCode(promise, "RUN_FAILED");
    assert.equal(error.cause, cleanupError);
    assert.deepEqual(error.failures, [cleanupError]);
    assert.equal(cleanupCount, 1);
    break;
  }
  case "cleanup-reason": {
    const reason = selectedRejectionReason();
    const controller = new AbortController();
    const promise = runEffectstream({
      ...options,
      processSignals: false,
      signal: controller.signal,
    });
    controller.abort();
    const error = await expectCode(promise, "RUN_FAILED");
    assert.equal(error.failures.length, 1);
    assert(Object.is(error.failures[0], reason));
    assert(Object.is(error.cause, reason));
    assert.equal(cleanupCount, 1);
    break;
  }
  case "signal": {
    const signal = process.argv[3] as NodeJS.Signals;
    const before = process.listenerCount(signal);
    const promise = runEffectstream({ ...options, processSignals: [signal] });
    process.emit(signal);
    await promise;
    assert.equal(process.listenerCount(signal), before);
    break;
  }
  case "repeat-signal": {
    const before = process.listenerCount("SIGTERM");
    const promise = runEffectstream({
      ...options,
      processSignals: ["SIGTERM", "SIGTERM"],
    });
    assert.equal(process.listenerCount("SIGTERM"), before + 1);
    process.emit("SIGTERM");
    process.emit("SIGTERM");
    await promise;
    assert.equal(cleanupCount, 1);
    assert.equal(process.listenerCount("SIGTERM"), before);
    break;
  }
  case "concurrency": {
    const firstSignals = process.argv[3] === "false"
      ? false
      : undefined;
    const secondSignals = process.argv[4] === "false"
      ? false
      : undefined;
    const controller = new AbortController();
    const first = runEffectstream({
      ...options,
      signal: controller.signal,
      processSignals: firstSignals,
    });
    await expectCode(
      runEffectstream({ ...options, processSignals: secondSignals }),
      "ALREADY_RUNNING",
    );
    controller.abort();
    await expectCode(first, "ABORTED");
    break;
  }
  case "no-listeners": {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const controller = new AbortController();
    const promise = runEffectstream({
      ...options,
      processSignals: [],
      signal: controller.signal,
    });
    assert.equal(process.listenerCount("SIGINT"), beforeInt);
    assert.equal(process.listenerCount("SIGTERM"), beforeTerm);
    controller.abort();
    await expectCode(promise, "ABORTED");
    break;
  }
  default:
    assert.fail(`Unknown process test scenario: ${scenario}`);
}

console.log("ok");
