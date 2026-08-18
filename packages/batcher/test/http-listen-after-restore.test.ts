// A request must never fall into a frozen batcher.
//
// Measured on preprod (sweep brief §2): restarting with a snapshot costs 47.7 s,
// and **46 s of that is a single synchronous block** — `DustWallet.restore`
// deserializing 5.1 MB of `DustLocalState` in WASM on the main thread. Meanwhile
// the HTTP server is already accepting traffic: `MidnightBalancingAdapter` fires
// `initialize()` from its constructor without awaiting it, and `Batcher.init()`
// starts `startHttpServer()` regardless. Every restart is therefore a ~46-second
// black hole in which connections are accepted and nothing answers — worse than
// the cold sync it replaces, where the worst single stall is 906 ms.
//
// The acceptance criterion is not "return a 503": while the event loop is inside
// the WASM call, no handler of any kind runs, so no response can be produced.
// The criterion is that a request **never hangs** — either the port is not yet
// listening (the client fails immediately and can retry or fail over), or the
// server answers promptly. That makes this an ORDERING property: do not bind
// the port until the adapter is past the startup work that can freeze the loop.
//
// Deliberately NOT addressed here: moving sync/restore off the main event loop.
// That is master-plan Q6 and an architecture change.

import { describe, expect, test } from "bun:test";
import { createNewBatcher } from "../core/batcher.ts";
import type { Batcher } from "../core/batcher.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { createServableGate } from "../adapters/midnight-balancing-adapter.ts";

/** Ask the OS for a port nothing is on, then hand it to the batcher. */
async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("probe") });
  const port = probe.port ?? 0;
  await probe.stop(true);
  if (port === 0) throw new Error("could not obtain a free port");
  return port;
}

const storage = () =>
  ({
    init: async () => {},
    addInput: async () => {},
    getPendingInputs: async () => [],
    getAllInputs: async () => [],
    getInputsByTarget: async () => [],
    removeProcessedInputs: async () => {},
    getInputCountAndSize: async () => ({ count: 0, size: 0 }),
    incrementRetryCount: async () => {},
    clearAllInputs: async () => {},
    updateInput: async () => {},
    clearAll: async () => {},
  }) as unknown as Parameters<typeof createNewBatcher>[1];

const stubAdapter = (extra: Record<string, unknown> = {}) =>
  ({
    submitBatch: async () => "0xhash",
    estimateBatchFee: () => "0",
    buildBatchData: () => null,
    getChainName: () => "stub",
    getAccountAddress: () => "batcher",
    isReady: () => true,
    verifySignature: () => true,
    ...extra,
  }) as unknown as Parameters<Batcher<DefaultBatcherInput>["addBlockchainAdapter"]>[1];

/** Did this request settle — either way — without hanging? */
async function probeRequest(
  port: number,
): Promise<{ outcome: "answered" | "refused"; elapsedMs: number }> {
  const startedAt = Date.now();
  const outcome = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5_000),
  }).then(() => "answered" as const, () => "refused" as const);
  return { outcome, elapsedMs: Date.now() - startedAt };
}

/**
 * Keep probing for `windowMs`. Returns the moment the port answers, or
 * "stayed-closed".
 *
 * A single probe after a fixed sleep is not enough and the first draft of this
 * test proved it: `Batcher.init()` needs ~800 ms to reach `startHttpServer`
 * (building the OpenAPI server dominates), so a 50 ms sleep made the test pass
 * against UNFIXED code — it was measuring startup latency, not ordering. The
 * window here is comfortably longer than that path.
 *
 * Every probe also stands in for the real acceptance criterion: a request must
 * settle, not hang. The maximum observed latency is returned so the test can
 * say so out loud.
 */
async function pollUntilAnswered(
  port: number,
  windowMs: number,
): Promise<{ result: "answered" | "stayed-closed"; maxLatencyMs: number }> {
  const deadline = Date.now() + windowMs;
  let maxLatencyMs = 0;
  while (Date.now() < deadline) {
    const probe = await probeRequest(port);
    maxLatencyMs = Math.max(maxLatencyMs, probe.elapsedMs);
    if (probe.outcome === "answered") return { result: "answered", maxLatencyMs };
    await Bun.sleep(25);
  }
  return { result: "stayed-closed", maxLatencyMs };
}

/** Longer than the ~800 ms `init()` needs to reach `startHttpServer`. */
const ORDERING_WINDOW_MS = 2_000;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("the HTTP port is not bound until adapters are past their blocking startup", () => {
  test("a request during a slow restore fails fast instead of hanging", async () => {
    const port = await freePort();
    const restore = deferred();

    const batcher = createNewBatcher(
      { pollingIntervalMs: 1000, port, enableHttpServer: true, enableEventSystem: false },
      storage(),
    );
    batcher.addBlockchainAdapter(
      "stub",
      stubAdapter({ whenServable: () => restore.promise }),
    );

    const init = batcher.init({ startPolling: false });

    const during = await pollUntilAnswered(port, ORDERING_WINDOW_MS);
    expect(during.result).toEqual("stayed-closed");
    // The whole point: every probe settled, none sat in a 46-second black hole.
    expect(during.maxLatencyMs).toBeLessThan(1_000);

    restore.resolve();
    await init;

    const after = await probeRequest(port);
    expect(after.outcome).toEqual("answered");

    await batcher.stopHttpServer();
  });

  test("an adapter that never declares itself servable does not deny the port forever", async () => {
    // A wedged or badly-implemented adapter must degrade to today's behaviour
    // (a listening, possibly-stalling server), not to a batcher with no
    // endpoints at all — an operator needs /health more than ever at that point.
    const port = await freePort();

    const batcher = createNewBatcher(
      {
        pollingIntervalMs: 1000,
        port,
        enableHttpServer: true,
        enableEventSystem: false,
        httpServerReadinessTimeoutMs: 100,
      },
      storage(),
    );
    batcher.addBlockchainAdapter(
      "stub",
      stubAdapter({ whenServable: () => new Promise<void>(() => {}) }),
    );

    await batcher.init({ startPolling: false });

    expect((await probeRequest(port)).outcome).toEqual("answered");
    await batcher.stopHttpServer();
  });

  test("an adapter that does not implement whenServable is unaffected", async () => {
    const port = await freePort();

    const batcher = createNewBatcher(
      { pollingIntervalMs: 1000, port, enableHttpServer: true, enableEventSystem: false },
      storage(),
    );
    batcher.addBlockchainAdapter("stub", stubAdapter());

    await batcher.init({ startPolling: false });

    expect((await probeRequest(port)).outcome).toEqual("answered");
    await batcher.stopHttpServer();
  });

  test("a whenServable that throws or rejects still lets the server start", async () => {
    // Readiness reporting is a courtesy; it must never be able to take the
    // HTTP server down with it.
    const port = await freePort();

    const batcher = createNewBatcher(
      { pollingIntervalMs: 1000, port, enableHttpServer: true, enableEventSystem: false },
      storage(),
    );
    batcher.addBlockchainAdapter(
      "a",
      stubAdapter({ whenServable: () => Promise.reject(new Error("boom")) }),
    );
    batcher.addBlockchainAdapter(
      "b",
      stubAdapter({
        whenServable: () => {
          throw new Error("boom synchronously");
        },
      }),
    );

    await batcher.init({ startPolling: false });

    expect((await probeRequest(port)).outcome).toEqual("answered");
    await batcher.stopHttpServer();
  });

  test("startHttpServer() waits too, not just init()", async () => {
    // There are three ways to reach the listener: init(), the Effection
    // `runBatcher` path (which spawns runHttpServer() → startHttpServer()
    // and never goes through init()), and a direct call. The first version of
    // this fix gated only init(), which left the black hole wide open on the
    // Effection path. The wait belongs at the choke point.
    const port = await freePort();
    const restore = deferred();

    const batcher = createNewBatcher(
      { pollingIntervalMs: 1000, port, enableHttpServer: true, enableEventSystem: false },
      storage(),
    );
    batcher.addBlockchainAdapter(
      "stub",
      stubAdapter({ whenServable: () => restore.promise }),
    );

    const started = batcher.startHttpServer();

    expect((await pollUntilAnswered(port, ORDERING_WINDOW_MS)).result)
      .toEqual("stayed-closed");

    restore.resolve();
    await started;

    expect((await probeRequest(port)).outcome).toEqual("answered");
    await batcher.stopHttpServer();
  });

  test("every adapter must be servable before the port opens", async () => {
    // One slow wallet is enough to freeze the loop, so the gate is the slowest
    // adapter, not the first one to finish.
    const port = await freePort();
    const slow = deferred();

    const batcher = createNewBatcher(
      { pollingIntervalMs: 1000, port, enableHttpServer: true, enableEventSystem: false },
      storage(),
    );
    batcher.addBlockchainAdapter("fast", stubAdapter({ whenServable: () => Promise.resolve() }));
    batcher.addBlockchainAdapter("slow", stubAdapter({ whenServable: () => slow.promise }));

    const init = batcher.init({ startPolling: false });

    expect((await pollUntilAnswered(port, ORDERING_WINDOW_MS)).result)
      .toEqual("stayed-closed");

    slow.resolve();
    await init;

    expect((await probeRequest(port)).outcome).toEqual("answered");
    await batcher.stopHttpServer();
  });
});

describe("the servable gate behind MidnightBalancingAdapter.whenServable", () => {
  // Tested as a unit rather than by driving the adapter: a real adapter builds
  // real wallets and opens real sockets, so the first draft of these tests
  // timed out against `http://x` while the SDK retried. The adapter's three
  // call sites are wiring; the semantics are here, and §2 exercises both live.

  const isOpen = async (gate: { promise: Promise<void> }): Promise<boolean> =>
    await Promise.race([gate.promise.then(() => true), Bun.sleep(20).then(() => false)]);

  test("opens only once EVERY wallet is past its restore", async () => {
    const gate = createServableGate(2);
    expect(gate.pending()).toEqual(2);
    expect(await isOpen(gate)).toBe(false);

    // One wallet finishing is not enough: the other can still freeze the loop,
    // and a frozen loop serves nobody.
    gate.mark(0);
    expect(gate.pending()).toEqual(1);
    expect(await isOpen(gate)).toBe(false);

    gate.mark(1);
    expect(gate.pending()).toEqual(0);
    expect(await isOpen(gate)).toBe(true);
  });

  test("marking the same wallet twice does not open the gate early", async () => {
    // The adapter marks from a sync sample AND from a `finally`, so double
    // marks are the normal case, not an edge case.
    const gate = createServableGate(2);
    gate.mark(0);
    gate.mark(0);
    gate.mark(0);
    expect(await isOpen(gate)).toBe(false);
    expect(gate.pending()).toEqual(1);
  });

  test("markAll opens the gate — the failure backstop", async () => {
    // The failure mode this prevents: a broken wallet holds the HTTP port shut,
    // so the operator loses /health exactly when they need it to find out the
    // wallet is broken.
    const gate = createServableGate(3);
    gate.markAll();
    expect(await isOpen(gate)).toBe(true);
    expect(gate.pending()).toEqual(0);
  });

  test("an adapter with no wallets starts open, and a stray index cannot throw", async () => {
    expect(await isOpen(createServableGate(0))).toBe(true);

    const gate = createServableGate(1);
    // Called from `finally` blocks: a gate must never turn a failed wallet
    // into a failed process.
    expect(() => {
      gate.mark(-1);
      gate.mark(7);
      gate.mark(Number.NaN);
    }).not.toThrow();
    expect(await isOpen(gate)).toBe(false);
  });
});
