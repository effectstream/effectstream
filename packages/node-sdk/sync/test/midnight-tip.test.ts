import { afterEach, describe, expect, test } from "bun:test";
import {
  getMidnightTip,
  MidnightTipError,
} from "../src/sync-protocols/midnight/tip.ts";

type TestServer = ReturnType<typeof Bun.serve>;

type Fixture = {
  server: TestServer;
  url: string;
  port: number;
  hits: number;
  activeRequests: number;
};

const fixtures = new Set<Fixture>();

async function startFixture(
  handler: (request: Request) => Response | Promise<Response>,
): Promise<Fixture> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      let fixture!: Fixture;
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          fixture.hits++;
          fixture.activeRequests++;
          try {
            return await handler(request);
          } finally {
            fixture.activeRequests--;
          }
        },
      });
      const port = server.port;
      if (port <= 10_000) {
        await server.stop(true);
        continue;
      }

      fixture = {
        server,
        url: `http://127.0.0.1:${port}/graphql`,
        port,
        hits: 0,
        activeRequests: 0,
      };
      fixtures.add(fixture);
      return fixture;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to allocate a loopback fixture port above 10000");
}

async function stopFixture(fixture: Fixture): Promise<void> {
  fixtures.delete(fixture);
  await fixture.server.stop(true);
}

async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await Bun.sleep(5);
  }
}

async function expectFixtureIdle(fixture: Fixture): Promise<void> {
  await waitFor(
    () =>
      fixture.activeRequests === 0 &&
      Number((fixture.server as TestServer & { pendingRequests?: number }).pendingRequests ?? 0) === 0,
    "fixture request cleanup",
  );
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
  throw new Error(`Expected MidnightTipError(${code}) without a partial value`);
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
  const remaining = [...fixtures];
  fixtures.clear();
  for (const fixture of remaining) await fixture.server.stop(true);
});

describe("getMidnightTip request contract", () => {
  test.each([0, 917_331, Number.MAX_SAFE_INTEGER])(
    "performs one exact POST and accepts height %d",
    async (height) => {
      let method: string | undefined;
      let body: string | undefined;
      let contentType: string | null | undefined;
      const fixture = await startFixture(async (request) => {
        method = request.method;
        body = await request.text();
        contentType = request.headers.get("content-type");
        return json({ data: { block: { height } } });
      });

      await expect(getMidnightTip({ indexer: fixture.url })).resolves.toEqual({ height });
      expect(fixture.hits).toBe(1);
      expect(method).toBe("POST");
      expect(body).toBe('{"query":"query { block { height } }"}');
      expect(contentType).toBe("application/json");
      await expectFixtureIdle(fixture);
    },
  );

  test.each([
    [301, "Moved Permanently"],
    [307, "Temporary Redirect"],
  ])(
    "treats redirect status %d as HTTP without following the target",
    async (status, statusText) => {
      const target = await startFixture(() =>
        json({ data: { block: { height: 999 } } }));
      const origin = await startFixture(() =>
        new Response(null, {
          status,
          statusText,
          headers: { Location: target.url },
        }));

      let value: unknown;
      let caught: unknown;
      try {
        value = await getMidnightTip({ indexer: origin.url });
      } catch (error) {
        caught = error;
      }

      expect({ originHits: origin.hits, targetHits: target.hits, value }).toEqual({
        originHits: 1,
        targetHits: 0,
        value: undefined,
      });
      expect(caught).toBeInstanceOf(MidnightTipError);
      const error = caught as MidnightTipError;
      expect(error.code).toBe("HTTP");
      expect(error.status).toBe(status);
      expect(error.statusText).toBe(statusText);
      expect(error.cause).toBeUndefined();
      expect(error.graphqlErrors).toBeUndefined();
      await expectFixtureIdle(origin);
      await expectFixtureIdle(target);
    },
  );

  test("reports HTTP before attempting body parsing", async () => {
    const fixture = await startFixture(() =>
      new Response("not-json", { status: 503, statusText: "Service Unavailable" }));

    const error = await expectTipError(getMidnightTip({ indexer: fixture.url }), "HTTP");
    expect(error.status).toBe(503);
    expect(error.statusText).toBe("Service Unavailable");
    expect(error.cause).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
    expect(fixture.hits).toBe(1);
    await expectFixtureIdle(fixture);
  });

  test("cancels an unread streaming body before settling HTTP", async () => {
    const runtime = globalThis as typeof globalThis & { fetch: typeof fetch };
    const originalFetch = runtime.fetch;
    let attempts = 0;
    let streamCancelled = 0;
    runtime.fetch = (async () => {
      attempts++;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("not-json"));
          },
          cancel() {
            streamCancelled++;
          },
        }),
        { status: 503, statusText: "Service Unavailable" },
      );
    }) as typeof fetch;

    try {
      const error = await expectTipError(
        getMidnightTip({ indexer: "http://127.0.0.1:10001/graphql" }),
        "HTTP",
      );
      expect(error.status).toBe(503);
      expect(error.statusText).toBe("Service Unavailable");
      expect(attempts).toBe(1);
      expect(streamCancelled).toBe(1);
    } finally {
      runtime.fetch = originalFetch;
    }
  });

  test("GraphQL errors win over partial data", async () => {
    const fixture = await startFixture(() =>
      json({
        errors: [{ message: "bad query" }],
        data: { block: { height: 42 } },
      }));

    const error = await expectTipError(getMidnightTip({ indexer: fixture.url }), "GRAPHQL");
    expect(error.graphqlErrors).toEqual([{ message: "bad query" }]);
    expect(Object.isFrozen(error.graphqlErrors)).toBe(true);
    expect(error.status).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(fixture.hits).toBe(1);
    await expectFixtureIdle(fixture);
  });

  test("GraphQL error details are a frozen shallow copy", async () => {
    const runtime = globalThis as typeof globalThis & { fetch: typeof fetch };
    const originalFetch = runtime.fetch;
    const detail = { message: "same object" };
    const details = [detail];
    let attempts = 0;
    runtime.fetch = (async () => {
      attempts++;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ errors: details }),
      } as Response;
    }) as typeof fetch;

    try {
      const error = await expectTipError(
        getMidnightTip({ indexer: "http://127.0.0.1:10001/graphql" }),
        "GRAPHQL",
      );
      expect(attempts).toBe(1);
      expect(error.graphqlErrors).not.toBe(details);
      expect(error.graphqlErrors?.[0]).toBe(detail);
      expect(Object.isFrozen(error.graphqlErrors)).toBe(true);
    } finally {
      runtime.fetch = originalFetch;
    }
  });

  test("an empty GraphQL errors array does not mask valid data", async () => {
    const fixture = await startFixture(() =>
      json({ errors: [], data: { block: { height: 42 } } }));
    await expect(getMidnightTip({ indexer: fixture.url })).resolves.toEqual({ height: 42 });
    expect(fixture.hits).toBe(1);
    await expectFixtureIdle(fixture);
  });

  test("malformed JSON is INVALID_RESPONSE and preserves the parser cause", async () => {
    const fixture = await startFixture(() =>
      new Response("{", { headers: { "Content-Type": "application/json" } }));
    const error = await expectTipError(
      getMidnightTip({ indexer: fixture.url }),
      "INVALID_RESPONSE",
    );
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.status).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
    expect(fixture.hits).toBe(1);
    await expectFixtureIdle(fixture);
  });

  test.each([
    ["array body", "[]"],
    ["null body", "null"],
    ["scalar body", "true"],
    ["present non-array errors", '{"errors":{}}'],
    ["present null errors", '{"errors":null}'],
    ["missing data", "{}"],
    ["null data", '{"data":null}'],
    ["array data", '{"data":[]}'],
    ["missing block", '{"data":{}}'],
    ["null block", '{"data":{"block":null}}'],
    ["array block", '{"data":{"block":[]}}'],
    ["missing height", '{"data":{"block":{}}}'],
    ["null height", '{"data":{"block":{"height":null}}}'],
    ["string height", '{"data":{"block":{"height":"12"}}}'],
    ["fractional height", '{"data":{"block":{"height":1.5}}}'],
    ["negative height", '{"data":{"block":{"height":-1}}}'],
    ["non-finite height", '{"data":{"block":{"height":1e400}}}'],
    ["unsafe height", '{"data":{"block":{"height":9007199254740992}}}'],
  ])("rejects %s without retry or partial data", async (_name, rawBody) => {
    const fixture = await startFixture(() =>
      new Response(rawBody, { headers: { "Content-Type": "application/json" } }));
    const error = await expectTipError(
      getMidnightTip({ indexer: fixture.url }),
      "INVALID_RESPONSE",
    );
    expect(error.status).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
    expect(fixture.hits).toBe(1);
    await expectFixtureIdle(fixture);
  });
});

describe("getMidnightTip option and transport failures", () => {
  test.each([
    ["missing options", undefined],
    ["null options", null],
    ["missing indexer", {}],
    ["non-string indexer", { indexer: new URL("http://127.0.0.1:10001") }],
    ["empty URL", { indexer: "" }],
    ["relative URL", { indexer: "/graphql" }],
    ["unsupported protocol", { indexer: "ftp://127.0.0.1:10001/graphql" }],
    ["zero timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: 0 }],
    ["negative timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: -1 }],
    ["fractional timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: 1.5 }],
    ["infinite timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: Infinity }],
    ["NaN timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: NaN }],
    ["null timeout", { indexer: "http://127.0.0.1:10001", requestTimeoutMs: null }],
    [
      "unsafe timeout",
      { indexer: "http://127.0.0.1:10001", requestTimeoutMs: Number.MAX_SAFE_INTEGER + 1 },
    ],
    ["invalid signal", { indexer: "http://127.0.0.1:10001", signal: {} }],
    ["null signal", { indexer: "http://127.0.0.1:10001", signal: null }],
  ])("validates %s before timer or I/O allocation", async (_name, options) => {
    const runtime = globalThis as any;
    const originalFetch = runtime.fetch;
    const originalSetTimeout = runtime.setTimeout;
    let fetches = 0;
    let timers = 0;
    runtime.fetch = () => {
      fetches++;
      throw new Error("fetch must not be called");
    };
    runtime.setTimeout = (...args: unknown[]) => {
      timers++;
      return originalSetTimeout(...args);
    };

    try {
      await expectTipError(getMidnightTip(options as any), "INVALID_OPTIONS");
      expect(fetches).toBe(0);
      expect(timers).toBe(0);
    } finally {
      runtime.fetch = originalFetch;
      runtime.setTimeout = originalSetTimeout;
    }
  });

  test("already-aborted input preserves its reason and performs no timer or fetch", async () => {
    const runtime = globalThis as any;
    const originalFetch = runtime.fetch;
    const originalSetTimeout = runtime.setTimeout;
    const caller = trackedAbortSignal();
    const reason = new Error("caller stopped");
    let fetches = 0;
    let timers = 0;
    caller.abort(reason);
    runtime.fetch = () => {
      fetches++;
      throw new Error("fetch must not be called");
    };
    runtime.setTimeout = (...args: unknown[]) => {
      timers++;
      return originalSetTimeout(...args);
    };

    try {
      const error = await expectTipError(
        getMidnightTip({ indexer: "http://127.0.0.1:10001", signal: caller.signal }),
        "ABORTED",
      );
      expect(error.cause).toBe(reason);
      expect(error.status).toBeUndefined();
      expect(error.graphqlErrors).toBeUndefined();
      expect(fetches).toBe(0);
      expect(timers).toBe(0);
      expect(caller.listenerCount()).toBe(0);
    } finally {
      runtime.fetch = originalFetch;
      runtime.setTimeout = originalSetTimeout;
    }
  });

  test("a local connection rejection is NETWORK with the original cause and one attempt", async () => {
    const fixture = await startFixture(() => json({ data: { block: { height: 1 } } }));
    const { url, port } = fixture;
    await stopFixture(fixture);

    const runtime = globalThis as typeof globalThis & { fetch: typeof fetch };
    const originalFetch = runtime.fetch;
    let attempts = 0;
    runtime.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
      attempts++;
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const error = await expectTipError(
        getMidnightTip({ indexer: url, requestTimeoutMs: 500 }),
        "NETWORK",
      );
      expect(attempts).toBe(1);
      expect(error.cause).toBeDefined();
      expect(error.status).toBeUndefined();
      expect(error.graphqlErrors).toBeUndefined();
    } finally {
      runtime.fetch = originalFetch;
    }

    const rebound = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response(),
    });
    await rebound.stop(true);
  });
});

describe("getMidnightTip cancellation, deadline, and cleanup", () => {
  async function stalledResponse(request: Request): Promise<Response> {
    await new Promise<void>((resolve) => {
      if (request.signal.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        request.signal.removeEventListener("abort", onAbort);
        resolve();
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    });
    return new Response(null, { status: 499 });
  }

  test("caller abort wins after one request and releases request/listener/timer ownership", async () => {
    const fixture = await startFixture(stalledResponse);
    const caller = trackedAbortSignal();
    const reason = { caller: true };
    const pending = getMidnightTip({
      indexer: fixture.url,
      signal: caller.signal,
      requestTimeoutMs: 1_000,
    });
    await waitFor(() => fixture.hits === 1, "caller-abort fixture request");
    expect(caller.listenerCount()).toBe(1);
    caller.abort(reason);

    const error = await expectTipError(pending, "ABORTED");
    expect(error.cause).toBe(reason);
    expect(error.status).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
    expect(fixture.hits).toBe(1);
    expect(caller.listenerCount()).toBe(0);
    await expectFixtureIdle(fixture);
  });

  test("timeout wins after one request and stays authoritative over a later caller abort", async () => {
    const fixture = await startFixture(stalledResponse);
    const caller = trackedAbortSignal();
    const lateReason = new Error("late caller abort");
    const pending = getMidnightTip({
      indexer: fixture.url,
      signal: caller.signal,
      requestTimeoutMs: 300,
    });
    await waitFor(() => fixture.hits === 1, "timeout fixture request");

    const error = await expectTipError(pending, "TIMEOUT");
    caller.abort(lateReason);
    expect(error.cause).toBeUndefined();
    expect(error.status).toBeUndefined();
    expect(error.graphqlErrors).toBeUndefined();
    expect(fixture.hits).toBe(1);
    expect(caller.listenerCount()).toBe(0);
    await expectFixtureIdle(fixture);
  });

  test("default and host-boundary deadlines are exact, chunked, and cleared", async () => {
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
    let activeFetches = 0;

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
      activeFetches++;
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => {
          activeFetches--;
          reject(signal?.reason);
        };
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    };

    try {
      fetchMode = "success";
      await expect(getMidnightTip({
        indexer: "http://127.0.0.1:10001/graphql",
      })).resolves.toEqual({ height: 99 });
      expect(timers).toHaveLength(1);
      expect(timers[0].delay).toBe(15_000);
      expect(timers[0].cleared).toBe(true);

      timers.length = 0;
      fetchMode = "pending";
      const exactMax = getMidnightTip({
        indexer: "http://127.0.0.1:10001/graphql",
        requestTimeoutMs: 2_147_483_647,
      });
      expect(timers).toHaveLength(1);
      expect(timers[0].delay).toBe(2_147_483_647);
      timers[0].callback();
      await expectTipError(exactMax, "TIMEOUT");
      expect(activeFetches).toBe(0);

      timers.length = 0;
      const aboveMax = getMidnightTip({
        indexer: "http://127.0.0.1:10001/graphql",
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
      expect(activeFetches).toBe(0);

      timers.length = 0;
      const caller = trackedAbortSignal();
      const reason = new Error("caller cancelled long deadline");
      const aborted = getMidnightTip({
        indexer: "http://127.0.0.1:10001/graphql",
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
      expect(activeFetches).toBe(0);
    } finally {
      runtime.setTimeout = originalSetTimeout;
      runtime.clearTimeout = originalClearTimeout;
      runtime.fetch = originalFetch;
    }
  });

  test("deadline and caller listener are cleared across non-cancellation settlements", async () => {
    type CapturedTimer = { cleared: boolean };
    const runtime = globalThis as any;
    const originalSetTimeout = runtime.setTimeout;
    const originalClearTimeout = runtime.clearTimeout;
    const originalFetch = runtime.fetch;
    const outcomes: Array<{
      code?: MidnightTipError["code"];
      fetch: () => Promise<Response>;
    }> = [
      { fetch: async () => json({ data: { block: { height: 7 } } }) },
      { code: "NETWORK", fetch: async () => { throw new Error("network"); } },
      { code: "HTTP", fetch: async () => new Response(null, { status: 503 }) },
      { code: "GRAPHQL", fetch: async () => json({ errors: [{ message: "bad" }] }) },
      { code: "INVALID_RESPONSE", fetch: async () => json({ data: null }) },
    ];

    try {
      for (const outcome of outcomes) {
        const timers: CapturedTimer[] = [];
        const caller = trackedAbortSignal();
        let attempts = 0;
        runtime.setTimeout = () => {
          const timer = { cleared: false };
          timers.push(timer);
          return timer;
        };
        runtime.clearTimeout = (timer: CapturedTimer) => {
          timer.cleared = true;
        };
        runtime.fetch = () => {
          attempts++;
          return outcome.fetch();
        };

        const pending = getMidnightTip({
          indexer: "http://127.0.0.1:10001/graphql",
          signal: caller.signal,
        });
        if (outcome.code) await expectTipError(pending, outcome.code);
        else await expect(pending).resolves.toEqual({ height: 7 });

        expect(attempts).toBe(1);
        expect(timers).toHaveLength(1);
        expect(timers[0].cleared).toBe(true);
        expect(caller.listenerCount()).toBe(0);
      }
    } finally {
      runtime.setTimeout = originalSetTimeout;
      runtime.clearTimeout = originalClearTimeout;
      runtime.fetch = originalFetch;
    }
  });
});
