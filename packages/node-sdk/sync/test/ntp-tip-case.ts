import assert from "node:assert/strict";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";

type ErrorCode =
  | "INVALID_OPTIONS"
  | "ABORTED"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "INVALID_TIME";

type NtpTipApi = {
  getNtpTip: (options: {
    startTime: number;
    blockTimeMS: number;
    servers?: readonly string[];
    requestTimeoutMs?: number;
    signal?: AbortSignal;
  }) => Promise<{ height: number }>;
  NtpTipError: new (...args: any[]) => Error & {
    code: ErrorCode;
    cause?: unknown;
    timeoutMs?: number;
  };
};

async function loadApi(): Promise<NtpTipApi> {
  const barrel = await Bun.file(
    "packages/node-sdk/sync/src/sync-protocols/mod.ts",
  ).text();
  assert.match(
    barrel,
    /ntp\/tip\.ts/,
    "sync protocol barrel must expose the approved NTP tip module",
  );
  const tip = (await import("../src/sync-protocols/ntp/tip.ts")) as Record<
    string,
    unknown
  >;
  assert.equal(typeof tip.getNtpTip, "function");
  assert.equal(typeof tip.NtpTipError, "function");
  return tip as unknown as NtpTipApi;
}

type Responder = (
  request: Buffer,
  remote: RemoteInfo,
  socket: Socket,
  hit: number,
) => void;

async function closeSocket(socket: Socket): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

async function startUdp(responder: Responder) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 64; attempt++) {
    const socket = createSocket("udp4");
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(0, "127.0.0.1", () => {
          socket.removeListener("error", reject);
          resolve();
        });
      });
      const port = socket.address().port;
      if (port <= 10_000) {
        await closeSocket(socket);
        continue;
      }
      let hits = 0;
      const clientPorts = new Set<number>();
      socket.on("message", (message, remote) => {
        hits += 1;
        clientPorts.add(remote.port);
        responder(message, remote, socket, hits);
      });
      return {
        socket,
        port,
        hits: () => hits,
        clientPorts: () => [...clientPorts],
        close: () => closeSocket(socket),
      };
    } catch (error) {
      lastError = error;
      await closeSocket(socket);
    }
  }
  throw lastError ?? new Error("no OS-selected UDP fixture port above 10000");
}

async function assertPortReusable(port: number): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "127.0.0.1", () => {
      socket.removeListener("error", reject);
      resolve();
    });
  });
  await closeSocket(socket);
}

function writeTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const ntpMs = unixMs + 2_208_988_800_000;
  const seconds = Math.floor(ntpMs / 1000);
  const fraction = Math.floor(((ntpMs % 1000) / 1000) * 2 ** 32);
  buffer.writeUInt32BE(seconds >>> 0, offset);
  buffer.writeUInt32BE(fraction >>> 0, offset + 4);
}

function responseFor(
  request: Buffer,
  options: {
    clockOffsetMs?: number;
    mode?: number;
    version?: number;
    leapIndicator?: number;
    stratum?: number;
    bogusOrigin?: boolean;
  } = {},
): Buffer {
  const response = Buffer.alloc(48);
  const leap = options.leapIndicator ?? 0;
  const version = options.version ?? 4;
  const mode = options.mode ?? 4;
  response[0] = (leap << 6) | (version << 3) | mode;
  response[1] = options.stratum ?? 1;
  response[2] = 4;
  response[3] = 0xec;
  response.write("LOCL", 12, 4, "ascii");
  const now = Date.now() + (options.clockOffsetMs ?? 0);
  writeTimestamp(response, 16, now - 1_000);
  request.copy(response, 24, 40, 48);
  if (options.bogusOrigin) response[31] ^= 1;
  writeTimestamp(response, 32, now);
  writeTimestamp(response, 40, now);
  return response;
}

const validResponder =
  (clockOffsetMs = 0, delayMs = 0): Responder =>
  (request, remote, socket) => {
    const respond = () => {
      if (!socket.address()) return;
      socket.send(
        responseFor(request, { clockOffsetMs }),
        remote.port,
        remote.address,
      );
    };
    if (delayMs) setTimeout(respond, delayMs);
    else respond();
  };

async function expectTipError(
  promise: Promise<unknown>,
  code: ErrorCode,
  ErrorType: NtpTipApi["NtpTipError"],
) {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof ErrorType, `expected NtpTipError(${code})`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected NtpTipError(${code})`);
}

function trackedAbortSignal() {
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

async function fakeArithmetic(): Promise<void> {
  const api = await loadApi();
  const tipModule = (await import("../src/sync-protocols/ntp/tip.ts")) as any;
  assert.equal(
    typeof tipModule.__getNtpTipWithSampler,
    "function",
    "private NTP sampler seam must exist for deterministic arithmetic tests",
  );
  const resolve = tipModule.__getNtpTipWithSampler as (
    options: Record<string, unknown>,
    sampler: (
      signal: AbortSignal,
      servers: readonly string[],
    ) => Promise<number>,
    runtime?: {
      setTimeout: typeof setTimeout;
      clearTimeout: typeof clearTimeout;
    },
  ) => Promise<{ height: number }>;

  for (const [timestamp, expected] of [
    [10_000, 0],
    [10_999, 0],
    [11_000, 1],
    [52_999, 42],
  ] as const) {
    let samples = 0;
    const result = await resolve(
      { startTime: 10_000, blockTimeMS: 1_000 },
      async () => {
        samples += 1;
        return timestamp;
      },
    );
    assert.deepEqual(result, { height: expected });
    assert.equal(samples, 1);
  }

  let samplerCalls = 0;
  let timerAllocations = 0;
  const runtime = {
    setTimeout: ((_callback: (...args: any[]) => void, _ms?: number) => {
      timerAllocations += 1;
      return 1 as any;
    }) as typeof setTimeout,
    clearTimeout: (() => {}) as typeof clearTimeout,
  };
  for (const options of [
    { startTime: Number.NaN, blockTimeMS: 1_000 },
    { startTime: Number.POSITIVE_INFINITY, blockTimeMS: 1_000 },
    { startTime: 0, blockTimeMS: 0 },
    { startTime: 0, blockTimeMS: -1 },
    { startTime: 0, blockTimeMS: 1.5 },
    { startTime: 0, blockTimeMS: 1_000, requestTimeoutMs: 0 },
    { startTime: 0, blockTimeMS: 1_000, requestTimeoutMs: 1.5 },
    { startTime: 0, blockTimeMS: 1_000, servers: [""] },
  ]) {
    await expectTipError(
      resolve(
        options,
        async () => {
          samplerCalls += 1;
          return 0;
        },
        runtime,
      ),
      "INVALID_OPTIONS",
      api.NtpTipError,
    );
  }
  assert.equal(samplerCalls, 0);
  assert.equal(timerAllocations, 0);

  let clearedTimers = 0;
  const successfulCaller = trackedAbortSignal();
  const successfulRuntime = {
    setTimeout: ((
      _callback: (...args: any[]) => void,
      milliseconds?: number,
    ) => {
      timerAllocations += 1;
      assert.equal(milliseconds, 250);
      return 2 as any;
    }) as typeof setTimeout,
    clearTimeout: ((_timer: any) => {
      clearedTimers += 1;
    }) as typeof clearTimeout,
  };
  await assert.doesNotReject(
    resolve(
      {
        startTime: 0,
        blockTimeMS: 1_000,
        requestTimeoutMs: 250,
        signal: successfulCaller.signal,
      },
      async () => 42_000,
      successfulRuntime,
    ),
  );
  assert.equal(clearedTimers, 1);
  assert.equal(successfulCaller.listenerCount(), 0);
  timerAllocations = 0;

  const alreadyAborted = new AbortController();
  const reason = new Error("already stopped");
  alreadyAborted.abort(reason);
  const aborted = await expectTipError(
    resolve(
      { startTime: 0, blockTimeMS: 1_000, signal: alreadyAborted.signal },
      async () => {
        samplerCalls += 1;
        return 0;
      },
      runtime,
    ),
    "ABORTED",
    api.NtpTipError,
  );
  assert.equal(aborted.cause, reason);
  assert.equal(samplerCalls, 0);
  assert.equal(timerAllocations, 0);

  await expectTipError(
    resolve({ startTime: 0, blockTimeMS: 1_000 }, async () => Number.NaN),
    "INVALID_TIME",
    api.NtpTipError,
  );
  await expectTipError(
    resolve({ startTime: 10_000, blockTimeMS: 1_000 }, async () => 9_999),
    "INVALID_TIME",
    api.NtpTipError,
  );
  await expectTipError(
    resolve(
      { startTime: -Number.MAX_SAFE_INTEGER, blockTimeMS: 1 },
      async () => Number.MAX_SAFE_INTEGER,
    ),
    "INVALID_TIME",
    api.NtpTipError,
  );
}

async function withServer(
  responder: Responder,
  action: (server: Awaited<ReturnType<typeof startUdp>>) => Promise<void>,
) {
  const server = await startUdp(responder);
  try {
    await action(server);
  } finally {
    const clientPorts = server.clientPorts();
    await server.close();
    await assertPortReusable(server.port);
    for (const port of clientPorts) await assertPortReusable(port);
  }
}

async function udpSuccess(): Promise<void> {
  const { getNtpTip } = await loadApi();
  await withServer(validResponder(), async (server) => {
    const started = Date.now();
    const result = await getNtpTip({
      startTime: started - 42_500,
      blockTimeMS: 1_000,
      servers: [`127.0.0.1:${server.port}`],
      requestTimeoutMs: 500,
    });
    assert.equal(result.height, 42);
    assert.equal(server.hits(), 1);
  });
}

async function isolation(concurrent: boolean): Promise<void> {
  const { getNtpTip } = await loadApi();
  const a = await startUdp(validResponder());
  const b = await startUdp(validResponder(100_000));
  try {
    const startTime = Date.now() - 5_500;
    const optionsA = {
      startTime,
      blockTimeMS: 1_000,
      servers: [`127.0.0.1:${a.port}`],
      requestTimeoutMs: 500,
    };
    const optionsB = { ...optionsA, servers: [`127.0.0.1:${b.port}`] };
    const [tipA, tipB] = concurrent
      ? await Promise.all([getNtpTip(optionsA), getNtpTip(optionsB)])
      : [await getNtpTip(optionsA), await getNtpTip(optionsB)];
    assert.equal(tipA.height, 5);
    assert.equal(tipB.height, 105);
    assert.equal(a.hits(), 1);
    assert.equal(b.hits(), 1);
  } finally {
    const ports = [...a.clientPorts(), ...b.clientPorts()];
    await a.close();
    await b.close();
    await assertPortReusable(a.port);
    await assertPortReusable(b.port);
    for (const port of ports) await assertPortReusable(port);
  }
}

async function silentTimeout(): Promise<void> {
  const api = await loadApi();
  await withServer(
    () => {},
    async (server) => {
      const started = Date.now();
      const error = await expectTipError(
        api.getNtpTip({
          startTime: 0,
          blockTimeMS: 1_000,
          servers: [`127.0.0.1:${server.port}`],
          requestTimeoutMs: 30,
        }),
        "TIMEOUT",
        api.NtpTipError,
      );
      assert.equal(error.timeoutMs, 30);
      assert(Date.now() - started < 1_000);
      assert.equal(server.hits(), 1);
    },
  );
}

async function alreadyAborted(): Promise<void> {
  const api = await loadApi();
  await withServer(validResponder(), async (server) => {
    const controller = new AbortController();
    const reason = { caller: "already" };
    controller.abort(reason);
    const error = await expectTipError(
      api.getNtpTip({
        startTime: 0,
        blockTimeMS: 1_000,
        servers: [`127.0.0.1:${server.port}`],
        requestTimeoutMs: 200,
        signal: controller.signal,
      }),
      "ABORTED",
      api.NtpTipError,
    );
    assert.equal(error.cause, reason);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(server.hits(), 0);
  });
}

async function callerAbort(): Promise<void> {
  const api = await loadApi();
  await withServer(
    () => {},
    async (server) => {
      const caller = trackedAbortSignal();
      const reason = new Error("caller stopped in flight");
      const pending = api.getNtpTip({
        startTime: 0,
        blockTimeMS: 1_000,
        servers: [`127.0.0.1:${server.port}`],
        requestTimeoutMs: 500,
        signal: caller.signal,
      });
      while (server.hits() === 0)
        await new Promise((resolve) => setTimeout(resolve, 1));
      assert.equal(caller.listenerCount(), 1);
      caller.abort(reason);
      const error = await expectTipError(pending, "ABORTED", api.NtpTipError);
      assert.equal(error.cause, reason);
      assert.equal(caller.listenerCount(), 0);
    },
  );
}

async function firstWinner(abortFirst: boolean): Promise<void> {
  const api = await loadApi();
  await withServer(
    () => {},
    async (server) => {
      const controller = new AbortController();
      const reason = new Error("ordered caller abort");
      const pending = api.getNtpTip({
        startTime: 0,
        blockTimeMS: 1_000,
        servers: [`127.0.0.1:${server.port}`],
        requestTimeoutMs: abortFirst ? 150 : 20,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(reason), abortFirst ? 10 : 100);
      const error = await expectTipError(
        pending,
        abortFirst ? "ABORTED" : "TIMEOUT",
        api.NtpTipError,
      );
      if (abortFirst) assert.equal(error.cause, reason);
      else assert.equal(error.timeoutMs, 20);
      await new Promise((resolve) => setTimeout(resolve, 120));
    },
  );
}

async function invalidResponse(kind: string): Promise<void> {
  const api = await loadApi();
  const responder: Responder = (request, remote, socket) => {
    const response =
      kind === "malformed"
        ? Buffer.alloc(7)
        : responseFor(
            request,
            kind === "bogus-origin"
              ? { bogusOrigin: true }
              : kind === "client-mode"
                ? { mode: 3 }
                : kind === "old-version"
                  ? { version: 3 }
                  : kind === "unsynchronized"
                    ? { leapIndicator: 3 }
                    : kind === "zero-stratum"
                      ? { stratum: 0 }
                      : { stratum: 16 },
          );
    socket.send(response, remote.port, remote.address);
  };
  await withServer(responder, async (server) => {
    await expectTipError(
      api.getNtpTip({
        startTime: 0,
        blockTimeMS: 1_000,
        servers: [`127.0.0.1:${server.port}`],
        requestTimeoutMs: 300,
      }),
      "INVALID_RESPONSE",
      api.NtpTipError,
    );
    assert.equal(server.hits(), 1);
  });
}

async function networkError(): Promise<void> {
  const api = await loadApi();
  const error = await expectTipError(
    api.getNtpTip({
      startTime: 0,
      blockTimeMS: 1_000,
      servers: ["300.300.300.300:123"],
      requestTimeoutMs: 1_000,
    }),
    "NETWORK",
    api.NtpTipError,
  );
  assert(error.cause instanceof Error);
}

async function lateResponse(): Promise<void> {
  const api = await loadApi();
  await withServer(validResponder(0, 80), async (server) => {
    await expectTipError(
      api.getNtpTip({
        startTime: 0,
        blockTimeMS: 1_000,
        servers: [`127.0.0.1:${server.port}`],
        requestTimeoutMs: 20,
      }),
      "TIMEOUT",
      api.NtpTipError,
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(server.hits(), 1);
  });
}

async function firstValidWinner(): Promise<void> {
  const { getNtpTip } = await loadApi();
  const slow = await startUdp(validResponder(50_000, 100));
  const fast = await startUdp(validResponder(0));
  try {
    const startTime = Date.now() - 7_500;
    const result = await getNtpTip({
      startTime,
      blockTimeMS: 1_000,
      servers: [`127.0.0.1:${slow.port}`, `127.0.0.1:${fast.port}`],
      requestTimeoutMs: 500,
    });
    assert.equal(result.height, 7);
    assert.equal(slow.hits(), 1);
    assert.equal(fast.hits(), 1);
    await new Promise((resolve) => setTimeout(resolve, 130));
  } finally {
    const ports = [...slow.clientPorts(), ...fast.clientPorts()];
    await slow.close();
    await fast.close();
    await assertPortReusable(slow.port);
    await assertPortReusable(fast.port);
    for (const port of ports) await assertPortReusable(port);
  }
}

const scenario = process.argv[2];
switch (scenario) {
  case "fake-arithmetic":
    await fakeArithmetic();
    break;
  case "udp-success":
    await udpSuccess();
    break;
  case "isolation-sequential":
    await isolation(false);
    break;
  case "isolation-concurrent":
    await isolation(true);
    break;
  case "timeout":
    await silentTimeout();
    break;
  case "already-aborted":
    await alreadyAborted();
    break;
  case "caller-abort":
    await callerAbort();
    break;
  case "abort-first":
    await firstWinner(true);
    break;
  case "timeout-first":
    await firstWinner(false);
    break;
  case "malformed":
  case "bogus-origin":
  case "client-mode":
  case "old-version":
  case "unsynchronized":
  case "zero-stratum":
  case "high-stratum":
    await invalidResponse(scenario);
    break;
  case "network-error":
    await networkError();
    break;
  case "late-response":
    await lateResponse();
    break;
  case "first-valid-winner":
    await firstValidWinner();
    break;
  default:
    assert.fail(`unknown NTP tip scenario: ${scenario}`);
}

console.log(`ok ${scenario}`);
