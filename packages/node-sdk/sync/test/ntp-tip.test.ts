import { afterEach, describe, expect, test } from "bun:test";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { getNtpTip, NtpTipError } from "../src/sync-protocols/ntp/tip.ts";

const NTP_EPOCH_OFFSET_MS = 2_208_988_800_000;
const BLOCK_TIME_MS = 600_000;

type Responder = (request: Buffer, remote: RemoteInfo, socket: Socket) => void;

type Fixture = {
  server: string;
  hits: () => number;
  close: () => Promise<void>;
};

const fixtures: Fixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

function writeTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const ntpMs = unixMs + NTP_EPOCH_OFFSET_MS;
  buffer.writeUInt32BE(Math.floor(ntpMs / 1000) >>> 0, offset);
  buffer.writeUInt32BE(Math.floor(((ntpMs % 1000) / 1000) * 2 ** 32) >>> 0, offset + 4);
}

/** A valid NTPv4 server response whose clock reads `serverTimeMs`. */
function responseFor(request: Buffer, serverTimeMs: number): Buffer {
  const response = Buffer.alloc(48);
  response[0] = (4 << 3) | 4; // leap 0, version 4, mode server
  response[1] = 1; // stratum
  response[3] = 0xec; // precision, 2^-20s
  response.write("LOCL", 12, 4, "ascii");
  writeTimestamp(response, 16, serverTimeMs - 1_000);
  request.copy(response, 24, 40, 48); // echo the client transmit as origin
  writeTimestamp(response, 32, serverTimeMs);
  writeTimestamp(response, 40, serverTimeMs);
  return response;
}

const serveTime =
  (serverTimeMs: () => number): Responder =>
  (request, remote, socket) =>
    socket.send(responseFor(request, serverTimeMs()), remote.port, remote.address);

const silent: Responder = () => {};

const serveGarbage: Responder = (_request, remote, socket) =>
  socket.send(Buffer.alloc(4), remote.port, remote.address);

async function startFixture(responder: Responder): Promise<Fixture> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.removeListener("error", reject);
      resolve();
    });
  });
  let hits = 0;
  socket.on("message", (request, remote) => {
    hits += 1;
    responder(request, remote, socket);
  });
  const fixture: Fixture = {
    server: `127.0.0.1:${socket.address().port}`,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        try {
          socket.close(() => resolve());
        } catch {
          resolve();
        }
      }),
  };
  fixtures.push(fixture);
  return fixture;
}

async function expectTipError(
  promise: Promise<unknown>,
  code: NtpTipError["code"],
): Promise<NtpTipError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(NtpTipError);
    expect((error as NtpTipError).code).toBe(code);
    return error as NtpTipError;
  }
  throw new Error(`Expected NtpTipError(${code})`);
}

describe("getNtpTip validation", () => {
  test.each([
    ["missing options", undefined],
    ["non-object options", 42],
    ["fractional startTime", { startTime: 0.5, blockTimeMS: 1000 }],
    ["unsafe startTime", { startTime: 2 ** 53, blockTimeMS: 1000 }],
    ["zero blockTimeMS", { startTime: 0, blockTimeMS: 0 }],
    ["negative blockTimeMS", { startTime: 0, blockTimeMS: -1 }],
    ["fractional blockTimeMS", { startTime: 0, blockTimeMS: 0.5 }],
    ["zero timeout", { startTime: 0, blockTimeMS: 1000, requestTimeoutMs: 0 }],
    [
      "timeout past the timer clamp",
      { startTime: 0, blockTimeMS: 1000, requestTimeoutMs: 2 ** 31 },
    ],
    ["non-array servers", { startTime: 0, blockTimeMS: 1000, servers: "x" }],
    ["empty server", { startTime: 0, blockTimeMS: 1000, servers: [""] }],
    [
      "padded server",
      { startTime: 0, blockTimeMS: 1000, servers: [" host "] },
    ],
    ["non-signal", { startTime: 0, blockTimeMS: 1000, signal: 7 }],
  ])("rejects %s", async (_name, options) => {
    await expectTipError(
      getNtpTip(options as never),
      "INVALID_OPTIONS",
    );
  });
});

describe("getNtpTip network behavior", () => {
  test("returns the inclusive page for the sampled NTP time", async () => {
    const startTime = Date.now();
    const fixture = await startFixture(
      serveTime(() => startTime + 3 * BLOCK_TIME_MS + BLOCK_TIME_MS / 2),
    );
    await expect(
      getNtpTip({ startTime, blockTimeMS: BLOCK_TIME_MS, servers: [fixture.server] }),
    ).resolves.toEqual({ height: 3 });
    expect(fixture.hits()).toBe(1);
  });

  test("concurrent calls own their server configuration", async () => {
    const startTime = Date.now();
    const fixtureA = await startFixture(
      serveTime(() => startTime + 3 * BLOCK_TIME_MS + BLOCK_TIME_MS / 2),
    );
    const fixtureB = await startFixture(
      serveTime(() => startTime + 7 * BLOCK_TIME_MS + BLOCK_TIME_MS / 2),
    );
    const [a, b] = await Promise.all([
      getNtpTip({ startTime, blockTimeMS: BLOCK_TIME_MS, servers: [fixtureA.server] }),
      getNtpTip({ startTime, blockTimeMS: BLOCK_TIME_MS, servers: [fixtureB.server] }),
    ]);
    expect(a).toEqual({ height: 3 });
    expect(b).toEqual({ height: 7 });
    expect(fixtureA.hits()).toBe(1);
    expect(fixtureB.hits()).toBe(1);
  });

  test("a sampled time before startTime is INVALID_TIME", async () => {
    const startTime = Date.now();
    const fixture = await startFixture(
      serveTime(() => startTime - 10 * BLOCK_TIME_MS),
    );
    await expectTipError(
      getNtpTip({ startTime, blockTimeMS: BLOCK_TIME_MS, servers: [fixture.server] }),
      "INVALID_TIME",
    );
  });

  test("a silent server is bounded by the deadline", async () => {
    const fixture = await startFixture(silent);
    const error = await expectTipError(
      getNtpTip({
        startTime: 0,
        blockTimeMS: BLOCK_TIME_MS,
        servers: [fixture.server],
        requestTimeoutMs: 300,
      }),
      "TIMEOUT",
    );
    expect(error.timeoutMs).toBe(300);
    expect(fixture.hits()).toBe(1);
  });

  test("malformed responses fail as NETWORK with a cause", async () => {
    const fixture = await startFixture(serveGarbage);
    const error = await expectTipError(
      getNtpTip({
        startTime: 0,
        blockTimeMS: BLOCK_TIME_MS,
        servers: [fixture.server],
        requestTimeoutMs: 5_000,
      }),
      "NETWORK",
    );
    expect(error.cause).toBeDefined();
  });

  test("an already-aborted signal sends no packets", async () => {
    const fixture = await startFixture(serveTime(() => Date.now()));
    const controller = new AbortController();
    const reason = new Error("stop before start");
    controller.abort(reason);
    const error = await expectTipError(
      getNtpTip({
        startTime: 0,
        blockTimeMS: BLOCK_TIME_MS,
        servers: [fixture.server],
        signal: controller.signal,
      }),
      "ABORTED",
    );
    expect(error.cause).toBe(reason);
    expect(fixture.hits()).toBe(0);
  });

  test("an in-flight abort keeps its cause and removes its listener", async () => {
    const fixture = await startFixture(silent);
    const controller = new AbortController();
    const reason = new Error("stop mid-flight");
    const pending = getNtpTip({
      startTime: 0,
      blockTimeMS: BLOCK_TIME_MS,
      servers: [fixture.server],
      requestTimeoutMs: 1_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(reason), 50);
    const error = await expectTipError(pending, "ABORTED");
    expect(error.cause).toBe(reason);
  });
});
