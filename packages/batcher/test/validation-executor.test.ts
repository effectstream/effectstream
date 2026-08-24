import { afterEach, expect, test } from "bun:test";
import {
  __resetSharedValidationExecutor,
  acquireValidationExecutor,
  ValidationExecutor,
  ValidationUnavailableError,
  type ValidationJob,
} from "../adapters/validation-executor.ts";

// Stub workers, not the real ledger: these tests are about the POOL —
// bounding, killing, replacing, refcounting. Driving them through WASM would
// make them slow and would not exercise a single extra branch.
const fixture = (name: string) =>
  new URL(`./fixtures/${name}`, import.meta.url).pathname;

const job = (overrides: Partial<ValidationJob> = {}): ValidationJob => ({
  txBytes: new Uint8Array([1, 2, 3]),
  paramsBytes: new Uint8Array([4, 5]),
  networkId: "undeployed",
  phase: "pre-spend",
  txStage: "unproven",
  nowMs: 0,
  ...overrides,
});

const executors: ValidationExecutor[] = [];
function makeExecutor(script: string, options = {}): ValidationExecutor {
  const executor = new ValidationExecutor({
    workerScript: fixture(script),
    concurrency: 1,
    ...options,
  });
  executors.push(executor);
  return executor;
}

afterEach(async () => {
  for (const executor of executors.splice(0)) await executor.close();
  __resetSharedValidationExecutor();
});

/** Signal 0 probes existence without delivering anything. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !predicate()) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

// --- The happy path ----------------------------------------------------

test("a job crosses the process boundary and comes back a verdict", async () => {
  const executor = makeExecutor("echo-worker.js");
  const verdict = await executor.submit(job());
  expect(verdict.valid).toBe(true);
  // The bytes arrived intact, not stringified or truncated.
  expect(verdict.reason).toBe("saw 3 bytes");
});

test("a large payload crosses intact", async () => {
  const executor = makeExecutor("echo-worker.js");
  const verdict = await executor.submit(
    job({ txBytes: new Uint8Array(250_000).fill(9) }),
  );
  // 250 KB is a realistic transaction; base64 would have inflated it by a
  // third, which is why the boundary uses structured serialization.
  expect(verdict.reason).toBe("saw 250000 bytes");
});

test("an invalid verdict is a verdict, not an error", async () => {
  const executor = makeExecutor("echo-worker.js");
  const verdict = await executor.submit(job({ networkId: "reject-me" }));
  expect(verdict.valid).toBe(false);
});

// --- Timeout: the reason this module exists ----------------------------

test("a wedged job is killed — the process is gone, not merely abandoned", async () => {
  const executor = makeExecutor("hung-worker.js", { jobTimeoutMs: 400 });

  const pending = executor.submit(job()).catch((e) => e);
  // Capture the child while it is burning, so we can check its fate by PID.
  await new Promise((r) => setTimeout(r, 100));
  const wedgedPid = executor.stats.pids[0];
  expect(typeof wedgedPid).toBe("number");
  expect(isAlive(wedgedPid)).toBe(true);

  const failure = await pending;
  expect(failure).toBeInstanceOf(ValidationUnavailableError);
  expect((failure as ValidationUnavailableError).kind).toBe("timeout");

  // The claim this module exists for. A Promise-race timeout — or
  // worker_threads.terminate(), measured at 198/200 CPU ticks still burning —
  // would leave this process alive and holding a core forever.
  await waitFor(() => !isAlive(wedgedPid), 2_000);
  expect(isAlive(wedgedPid)).toBe(false);
  expect(executor.stats.busy).toBe(0);
});

test("the main thread stays responsive while a job burns a core", async () => {
  const executor = makeExecutor("hung-worker.js", { jobTimeoutMs: 1_500 });
  executor.submit(job()).catch(() => {});
  await new Promise((r) => setTimeout(r, 50));

  // Sample event-loop scheduling delay while a child is at 100% CPU. If the
  // work were running inline, these ticks would slip by the length of the
  // call — seconds, for a real 46-output transaction.
  const lags: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 50));
    lags.push(Date.now() - t0 - 50);
  }
  const worst = Math.max(...lags);
  console.log(`[measured] worst event-loop lag while a child burns: ${worst}ms`);
  expect(worst).toBeLessThan(100);
});

test("the pool keeps working after a timeout", async () => {
  const executor = makeExecutor("hung-worker.js", { jobTimeoutMs: 300 });
  await executor.submit(job()).catch(() => {});

  // The killed child must have been replaced, or the pool is now empty and
  // every later job hangs forever.
  await new Promise((r) => setTimeout(r, 100));
  expect(executor.stats.children).toBe(1);
});

// --- Crashes and nonsense ----------------------------------------------

test("a worker that dies mid-job fails that job and is replaced", async () => {
  const executor = makeExecutor("crash-worker.js");

  const failure = await executor.submit(job()).catch((e) => e);
  expect(failure).toBeInstanceOf(ValidationUnavailableError);
  expect((failure as ValidationUnavailableError).kind).toBe("worker-failed");

  await new Promise((r) => setTimeout(r, 100));
  expect(executor.stats.children).toBe(1);
});

test("an unusable reply fails closed rather than passing", async () => {
  const executor = makeExecutor("garbage-worker.js");
  const failure = await executor.submit(job()).catch((e) => e);
  // A reply we cannot read must never be treated as approval.
  expect(failure).toBeInstanceOf(ValidationUnavailableError);
  expect((failure as ValidationUnavailableError).kind).toBe("worker-failed");
});

// --- Back-pressure -----------------------------------------------------

test("a full queue rejects immediately instead of growing", async () => {
  const executor = makeExecutor("slow-worker.js", {
    concurrency: 1,
    queueLimit: 2,
    jobTimeoutMs: 5_000,
  });

  // One job occupies the single child; two more fill the queue.
  const running = executor.submit(job({ nowMs: 300 }));
  await new Promise((r) => setTimeout(r, 50));
  const queued = [
    executor.submit(job({ nowMs: 10 })),
    executor.submit(job({ nowMs: 10 })),
  ];

  const failure = await executor.submit(job({ nowMs: 10 })).catch((e) => e);
  expect(failure).toBeInstanceOf(ValidationUnavailableError);
  expect((failure as ValidationUnavailableError).kind).toBe("saturated");

  await Promise.all([running, ...queued]);

  // Draining restores admission — saturation is back-pressure, not a fault.
  await expect(executor.submit(job({ nowMs: 10 }))).resolves.toBeDefined();
});

test("queued work is drained in order without loss", async () => {
  const executor = makeExecutor("echo-worker.js", { concurrency: 2 });
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8];
  const verdicts = await Promise.all(
    sizes.map((n) => executor.submit(job({ txBytes: new Uint8Array(n) }))),
  );
  expect(verdicts.map((v) => v.reason)).toEqual(sizes.map((n) => `saw ${n} bytes`));
});

// --- Lifecycle ---------------------------------------------------------

test("closing fails outstanding jobs rather than hanging them", async () => {
  const executor = makeExecutor("slow-worker.js", { jobTimeoutMs: 5_000 });
  const pending = executor.submit(job({ nowMs: 3_000 })).catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));

  await executor.close();

  const failure = await pending;
  expect(failure).toBeInstanceOf(ValidationUnavailableError);
  expect((failure as ValidationUnavailableError).kind).toBe("closed");
});

test("submitting to a closed executor is refused, not queued", async () => {
  const executor = makeExecutor("echo-worker.js");
  await executor.close();
  const failure = await executor.submit(job()).catch((e) => e);
  expect((failure as ValidationUnavailableError).kind).toBe("closed");
});

// --- Refcounting: adapters share one pool ------------------------------

test("two holders share one executor", () => {
  const a = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  const b = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  expect(a.executor).toBe(b.executor);
  executors.push(a.executor);
});

test("one holder closing does not take the pool from the other", async () => {
  const a = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  const b = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  executors.push(a.executor);

  await a.release();

  // b is still holding a reference: its jobs must still run. Getting this
  // wrong would mean one product's shutdown silently disabling every other
  // product's validation.
  await expect(b.executor.submit(job())).resolves.toMatchObject({ valid: true });
  await b.release();
});

test("the last release shuts the pool down", async () => {
  const a = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  const b = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  const executor = a.executor;

  await a.release();
  await b.release();

  const failure = await executor.submit(job()).catch((e) => e);
  expect((failure as ValidationUnavailableError).kind).toBe("closed");
});

test("releasing twice does not drop someone else's reference", async () => {
  const a = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  const b = acquireValidationExecutor({ workerScript: fixture("echo-worker.js"), concurrency: 1 });
  executors.push(a.executor);

  await a.release();
  await a.release(); // idempotent — must not consume b's reference

  await expect(b.executor.submit(job())).resolves.toMatchObject({ valid: true });
  await b.release();
});

// --- The real worker ---------------------------------------------------
//
// Everything above uses stubs to exercise pool mechanics. This one boots the
// actual child entrypoint, so it covers what stubs cannot: that the ledger
// WASM loads in a subprocess, that serialized parameters survive the boundary
// and deserialize on the far side, and that a failure there fails CLOSED.

test("the real worker loads the ledger, survives the boundary, and fails closed", async () => {
  const { LedgerParameters, Transaction } = await import("@midnight-ntwrk/ledger-v8");
  const paramsBytes = LedgerParameters.initialParameters().serialize();

  const executor = new ValidationExecutor({
    workerScript: new URL("../adapters/validation-worker.ts", import.meta.url).pathname,
    concurrency: 1,
    jobTimeoutMs: 30_000,
  });
  executors.push(executor);

  const verdict = await executor.submit(job({
    // Not a transaction. The point is the verdict, not the parse: bytes we
    // cannot even deserialize must come back rejected, never approved.
    txBytes: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    paramsBytes,
    networkId: "undeployed",
    txStage: "unproven",
    nowMs: Date.now(),
  }));

  expect(verdict.valid).toBe(false);
  expect(verdict.errorCode).toBe("NOT_WELL_FORMED");
  // A reason came back, and it is bounded rather than echoed wholesale.
  expect(typeof verdict.reason).toBe("string");
  expect(verdict.reason!.length).toBeLessThanOrEqual(513);

  // A parseable transaction reaches makeStrictness even if a later
  // well-formedness rule rejects it. The diagnostic is captured inside the
  // child at that exact boundary, not reconstructed by this caller.
  const traced = await executor.submit(job({
    txBytes: Transaction.fromParts("undeployed").serialize(),
    paramsBytes,
    networkId: "undeployed",
    phase: "pre-spend",
    txStage: "unproven",
    nowMs: Date.now(),
    includeDiagnostics: true,
  }));
  expect(traced.diagnostics).toEqual({
    phase: "pre-spend",
    txStage: "unproven",
    strictness: {
      enforceBalancing: false,
      verifySignatures: false,
      enforceLimits: false,
      verifyNativeProofs: false,
      verifyContractProofs: false,
    },
  });
}, 60_000);
