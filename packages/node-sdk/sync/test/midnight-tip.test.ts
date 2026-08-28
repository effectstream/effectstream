import { afterEach, describe, expect, test } from "bun:test";
import { run } from "effection";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  getMidnightTip,
  MidnightTipError,
} from "../src/sync-protocols/midnight/tip.ts";
import { MidnightSyncState } from "../src/sync-protocols/midnight/state.ts";

type TestServer = ReturnType<typeof Bun.serve>;
const servers: TestServer[] = [];

async function startServer(
  fetch: (request: Request) => Response | Promise<Response>,
): Promise<{ server: TestServer; url: string; port: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch });
      const port = server.port;
      if (port <= 10_000) {
        await server.stop(true);
        continue;
      }
      servers.push(server);
      return { server, url: `http://127.0.0.1:${port}/graphql`, port };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

async function expectTipError(
  promise: Promise<unknown>,
  code: MidnightTipError["code"],
): Promise<MidnightTipError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MidnightTipError);
    expect((error as MidnightTipError).code).toBe(code);
    return error as MidnightTipError;
  }
  throw new Error(`Expected MidnightTipError(${code})`);
}

function trackedAbortSignal(): {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
  listenerCount: () => number;
} {
  const controller = new AbortController();
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const signal = {
    get aborted() {
      return controller.signal.aborted;
    },
    get reason() {
      return controller.signal.reason;
    },
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) {
      if (type === "abort") listeners.add(listener);
      controller.signal.addEventListener(type, listener, options);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: EventListenerOptions | boolean,
    ) {
      if (type === "abort") listeners.delete(listener);
      controller.signal.removeEventListener(type, listener, options);
    },
  } as AbortSignal;
  return {
    signal,
    abort: (reason?: unknown) => controller.abort(reason),
    listenerCount: () => listeners.size,
  };
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.stop(true);
});

describe("getMidnightTip", () => {
  test.each([0, 917_331])("accepts safe integer height %d", async (height) => {
    let body: unknown;
    const { url } = await startServer(async (request) => {
      body = await request.json();
      return json({ data: { block: { height } } });
    });
    await expect(getMidnightTip({ indexer: url })).resolves.toEqual({ height });
    expect(body).toEqual({ query: "query { block { height } }" });
  });

  test("reports HTTP before attempting body parsing", async () => {
    const { url } = await startServer(() => new Response("not json", {
      status: 503,
      statusText: "Unavailable",
    }));
    const error = await expectTipError(getMidnightTip({ indexer: url }), "HTTP");
    expect(error.status).toBe(503);
    expect(error.statusText).toBe("Service Unavailable");
    expect(error.cause).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
  });

  test("preserves a frozen shallow copy of GraphQL errors", async () => {
    const details = [{ message: "bad query" }];
    const { url } = await startServer(() => json({ errors: details }));
    const error = await expectTipError(getMidnightTip({ indexer: url }), "GRAPHQL");
    expect(error.graphqlErrors).toEqual(details);
    expect(error.graphqlErrors).not.toBe(details);
    expect(Object.isFrozen(error.graphqlErrors)).toBe(true);
    expect(error.status).toBeUndefined();
  });

  test("classifies malformed JSON and keeps its parser cause", async () => {
    const { url } = await startServer(() => new Response("{"));
    const error = await expectTipError(
      getMidnightTip({ indexer: url }),
      "INVALID_RESPONSE",
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  test.each([
    ["array body", []],
    ["null body", null],
    ["non-array errors", { errors: {} }],
    ["missing data", {}],
    ["null data", { data: null }],
    ["missing block", { data: {} }],
    ["null block", { data: { block: null } }],
    ["missing height", { data: { block: {} } }],
    ["string height", { data: { block: { height: "12" } } }],
    ["fractional height", { data: { block: { height: 1.5 } } }],
    ["negative height", { data: { block: { height: -1 } } }],
    ["unsafe height", { data: { block: { height: Number.MAX_SAFE_INTEGER + 1 } } }],
  ])("rejects %s", async (_name, body) => {
    const { url } = await startServer(() => json(body));
    await expectTipError(getMidnightTip({ indexer: url }), "INVALID_RESPONSE");
  });

  test.each([
    ["relative URL", { indexer: "/graphql" }],
    ["unsupported protocol", { indexer: "ftp://example.test/graphql" }],
    ["zero timeout", { indexer: "http://example.test", requestTimeoutMs: 0 }],
    ["fractional timeout", { indexer: "http://example.test", requestTimeoutMs: 1.5 }],
    ["infinite timeout", { indexer: "http://example.test", requestTimeoutMs: Infinity }],
  ])("validates %s before network work", async (_name, options) => {
    await expectTipError(getMidnightTip(options), "INVALID_OPTIONS");
  });

  test("already-aborted input performs no fetch", async () => {
    let hits = 0;
    const { url } = await startServer(() => {
      hits++;
      return json({ data: { block: { height: 1 } } });
    });
    const controller = new AbortController();
    const reason = new Error("caller stopped");
    controller.abort(reason);
    const error = await expectTipError(
      getMidnightTip({ indexer: url, signal: controller.signal }),
      "ABORTED",
    );
    expect(error.cause).toBe(reason);
    expect(hits).toBe(0);
  });

  test("caller abort wins before timeout", async () => {
    const { url } = await startServer(async () => {
      await Bun.sleep(100);
      return json({ data: { block: { height: 1 } } });
    });
    const controller = new AbortController();
    const reason = { caller: true };
    const pending = getMidnightTip({
      indexer: url,
      signal: controller.signal,
      requestTimeoutMs: 80,
    });
    setTimeout(() => controller.abort(reason), 10);
    const error = await expectTipError(pending, "ABORTED");
    expect(error.cause).toBe(reason);
  });

  test("timeout wins before later caller abort", async () => {
    const { url } = await startServer(async () => {
      await Bun.sleep(100);
      return json({ data: { block: { height: 1 } } });
    });
    const controller = new AbortController();
    const pending = getMidnightTip({
      indexer: url,
      signal: controller.signal,
      requestTimeoutMs: 10,
    });
    setTimeout(() => controller.abort(new Error("late")), 40);
    const error = await expectTipError(pending, "TIMEOUT");
    expect(error.cause).toBeUndefined();
  });

  test("safe-integer deadlines at the host timer boundary remain exact and clean up", async () => {
    type CapturedTimer = {
      callback: () => void;
      delay: number;
      cleared: boolean;
    };
    const runtime = globalThis as any;
    const originalSetTimeout = runtime.setTimeout;
    const originalClearTimeout = runtime.clearTimeout;
    const originalFetch = runtime.fetch;
    const timers: CapturedTimer[] = [];
    let fetchMode: "pending" | "success" = "pending";

    runtime.setTimeout = (callback: () => void, delay: number) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    };
    runtime.clearTimeout = (timer: CapturedTimer) => {
      timer.cleared = true;
    };
    runtime.fetch = (_input: unknown, init?: RequestInit) => {
      if (fetchMode === "success") {
        return Promise.resolve(json({ data: { block: { height: 99 } } }));
      }
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => reject(signal?.reason);
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    };

    try {
      const exactMax = getMidnightTip({
        indexer: "http://example.test/graphql",
        requestTimeoutMs: 2_147_483_647,
      });
      expect(timers).toHaveLength(1);
      expect(timers[0].delay).toBe(2_147_483_647);
      timers[0].callback();
      await expectTipError(exactMax, "TIMEOUT");

      timers.length = 0;
      const aboveMax = getMidnightTip({
        indexer: "http://example.test/graphql",
        requestTimeoutMs: 2_147_483_648,
      });
      let aboveMaxSettled = false;
      void aboveMax.then(
        () => { aboveMaxSettled = true; },
        () => { aboveMaxSettled = true; },
      );
      expect(timers).toHaveLength(1);
      expect(timers[0].delay).toBe(2_147_483_647);
      timers[0].callback();
      expect(timers).toHaveLength(2);
      expect(timers[1].delay).toBe(1);
      await Promise.resolve();
      expect(aboveMaxSettled).toBe(false);
      timers[1].callback();
      await expectTipError(aboveMax, "TIMEOUT");

      timers.length = 0;
      const caller = trackedAbortSignal();
      const reason = new Error("caller cancelled long deadline");
      const aborted = getMidnightTip({
        indexer: "http://example.test/graphql",
        requestTimeoutMs: 2_147_483_648,
        signal: caller.signal,
      });
      expect(caller.listenerCount()).toBe(1);
      expect(timers[0].delay).toBe(2_147_483_647);
      caller.abort(reason);
      const abortedError = await expectTipError(aborted, "ABORTED");
      expect(abortedError.cause).toBe(reason);
      expect(timers[0].cleared).toBe(true);
      expect(caller.listenerCount()).toBe(0);

      timers.length = 0;
      fetchMode = "success";
      await expect(getMidnightTip({
        indexer: "http://example.test/graphql",
        requestTimeoutMs: 2_147_483_648,
      })).resolves.toEqual({ height: 99 });
      expect(timers[0].delay).toBe(2_147_483_647);
      expect(timers[0].cleared).toBe(true);
    } finally {
      runtime.setTimeout = originalSetTimeout;
      runtime.clearTimeout = originalClearTimeout;
      runtime.fetch = originalFetch;
    }
  });

  test("network rejection retains the original cause", async () => {
    const { server, url, port } = await startServer(() => json({}));
    await server.stop(true);
    servers.splice(servers.indexOf(server), 1);
    const error = await expectTipError(
      getMidnightTip({ indexer: url, requestTimeoutMs: 200 }),
      "NETWORK",
    );
    expect(error.cause).toBeDefined();
    const rebound = Bun.serve({ port, hostname: "127.0.0.1", fetch: () => new Response() });
    await rebound.stop(true);
  });

  test("empty GraphQL errors array does not mask valid data", async () => {
    const { url } = await startServer(() => json({
      errors: [],
      data: { block: { height: 42 } },
    }));
    await expect(getMidnightTip({ indexer: url })).resolves.toEqual({ height: 42 });
  });
});

test("returned boundary is included by MidnightSyncState", async () => {
  let mockTip = 750;
  let hits = 0;
  const { url } = await startServer(() => {
    hits++;
    return json({ data: { block: { height: mockTip } } });
  });
  const boundary = (await getMidnightTip({ indexer: url })).height;
  mockTip += 5;
  const config = {
    networkType: ConfigNetworkType.MIDNIGHT,
    network: {
      name: "midnight-boundary-test",
      type: ConfigNetworkType.MIDNIGHT,
      networkId: "undeployed",
    },
    syncProtocol: {
      name: "midnight-boundary-test",
      type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      indexer: url,
      startBlockHeight: boundary,
      stopBlockHeight: undefined,
      pollingInterval: 100,
      requestTimeoutMs: 1_000,
      stepSize: 10,
      paginationLimit: 50,
      delayMs: 0,
    },
  } as any;
  const client = {
    fetchLatestBlock: async () => ({
      block: { height: (await getMidnightTip({ indexer: url })).height },
    }),
  } as any;
  const state = new MidnightSyncState(
    undefined,
    config,
    {} as any,
    client,
    undefined as any,
  );
  const input = await run(() => state.stateToInput());
  expect(input).toEqual({ from: boundary, to: boundary + 5, isPresync: false });
  expect(hits).toBe(2);
});
