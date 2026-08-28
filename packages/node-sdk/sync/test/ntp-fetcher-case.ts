import assert from "node:assert/strict";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { run } from "effection";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { NtpFetcher } from "../src/sync-protocols/ntp/fetcher.ts";
import { NtpSyncState } from "../src/sync-protocols/ntp/state.ts";

type Responder = (request: Buffer, remote: RemoteInfo, socket: Socket) => void;

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
        responder(message, remote, socket);
      });
      return {
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
  throw lastError ?? new Error("no OS-selected UDP port above 10000");
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
  const seconds = Math.floor(ntpMs / 1_000);
  const fraction = Math.floor(((ntpMs % 1_000) / 1_000) * 2 ** 32);
  buffer.writeUInt32BE(seconds >>> 0, offset);
  buffer.writeUInt32BE(fraction >>> 0, offset + 4);
}

function responseFor(request: Buffer, clockOffsetMs = 0): Buffer {
  const response = Buffer.alloc(48);
  response[0] = (4 << 3) | 4;
  response[1] = 1;
  response[2] = 4;
  response[3] = 0xec;
  response.write("LOCL", 12, 4, "ascii");
  const now = Date.now() + clockOffsetMs;
  writeTimestamp(response, 16, now - 1_000);
  request.copy(response, 24, 40, 48);
  writeTimestamp(response, 32, now);
  writeTimestamp(response, 40, now);
  return response;
}

const responder =
  (clockOffsetMs = 0): Responder =>
  (request, remote, socket) => {
    socket.send(
      responseFor(request, clockOffsetMs),
      remote.port,
      remote.address,
    );
  };

function config(servers?: string[]) {
  return {
    networkType: ConfigNetworkType.NTP,
    syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
    network: {
      name: "controlled-clock",
      type: ConfigNetworkType.NTP,
      blockTimeMS: 1_000,
      startTime: 0,
      servers,
    },
    syncProtocol: {
      name: "controlled-clock",
      type: ConfigSyncProtocolType.NTP_MAIN,
      startBlockHeight: 42,
      pollingInterval: 1_000,
      stepSize: 10,
    },
    primitives: [],
  } as any;
}

async function withTwoServers(
  action: (
    a: Awaited<ReturnType<typeof startUdp>>,
    b: Awaited<ReturnType<typeof startUdp>>,
  ) => Promise<void>,
) {
  const a = await startUdp(responder());
  const b = await startUdp(responder(100_000));
  try {
    await action(a, b);
  } finally {
    const clientPorts = [...a.clientPorts(), ...b.clientPorts()];
    await a.close();
    await b.close();
    await assertPortReusable(a.port);
    await assertPortReusable(b.port);
    for (const port of clientPorts) await assertPortReusable(port);
  }
}

switch (process.argv[2]) {
  case "default-owned": {
    const absentA = new NtpFetcher(config());
    const absentB = new NtpFetcher(config());
    const empty = new NtpFetcher(config([]));
    assert.notEqual(absentA.ntpTimeSync, absentB.ntpTimeSync);
    assert.notEqual(absentA.ntpTimeSync, empty.ntpTimeSync);
    assert.notEqual(absentB.ntpTimeSync, empty.ntpTimeSync);
    break;
  }
  case "configured-copy": {
    const servers = ["127.0.0.1:12345"];
    const fetcher = new NtpFetcher(config(servers));
    servers[0] = "127.0.0.1:54321";
    servers.push("127.0.0.1:11111");
    const options = (fetcher.ntpTimeSync as any).options;
    assert.deepEqual(options.servers, [{ host: "127.0.0.1", port: 12345 }]);
    break;
  }
  case "sequential-isolation": {
    await withTwoServers(async (a, b) => {
      const fetcherA = new NtpFetcher(config([`127.0.0.1:${a.port}`]));
      const fetcherB = new NtpFetcher(config([`127.0.0.1:${b.port}`]));
      assert.notEqual(fetcherA.ntpTimeSync, fetcherB.ntpTimeSync);
      await fetcherA.ntpTimeSync.getTime();
      assert.equal(a.hits(), 8);
      assert.equal(b.hits(), 0);
      await fetcherB.ntpTimeSync.getTime();
      assert.equal(a.hits(), 8);
      assert.equal(b.hits(), 8);
      await fetcherA.ntpTimeSync.getTime();
      await fetcherB.ntpTimeSync.getTime();
      assert.equal(a.hits(), 8);
      assert.equal(b.hits(), 8);
    });
    break;
  }
  case "concurrent-isolation": {
    await withTwoServers(async (a, b) => {
      const fetcherA = new NtpFetcher(config([`127.0.0.1:${a.port}`]));
      const fetcherB = new NtpFetcher(config([`127.0.0.1:${b.port}`]));
      assert.notEqual(fetcherA.ntpTimeSync, fetcherB.ntpTimeSync);
      const [resultA, resultB] = await Promise.all([
        fetcherA.ntpTimeSync.getTime(),
        fetcherB.ntpTimeSync.getTime(),
      ]);
      assert(resultA.offset > -1_000 && resultA.offset < 1_000);
      assert(resultB.offset > 99_000 && resultB.offset < 101_000);
      assert.equal(a.hits(), 8);
      assert.equal(b.hits(), 8);
    });
    break;
  }
  case "numeric-page-one": {
    const fetcher = {
      getLatestPage: function* () {
        return 100;
      },
      intervalFromStart: (start: number) => ({ from: start, to: start + 9 }),
      previousInterval: (start: number) => ({
        from: start - 10,
        to: start - 1,
      }),
      nextInterval: (end: number) => ({ from: end + 1, to: end + 10 }),
    } as any;
    const state = new NtpSyncState(
      undefined as any,
      config(),
      fetcher,
      undefined as any,
    );
    const input = await run(() => state.stateToInput());
    assert.deepEqual(input, { from: 1, to: 10, isPresync: true });
    break;
  }
  case "offset-warnings": {
    const fetcher = new NtpFetcher(config());
    const originalConsoleError = console.error;
    const warnings: string[] = [];
    console.error = (...values: unknown[]) => warnings.push(values.join(" "));
    try {
      for (const offset of [6_001, -6_001, 5_000, -5_000]) {
        (fetcher.ntpTimeSync as any).getTime = async () => ({
          now: new Date(10_000),
          offset,
        });
        await run(() => fetcher.getLatestPage(undefined));
      }
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(warnings.length, 2);
    assert(warnings[0].includes("6001"));
    assert(warnings[1].includes("-6001"));
    break;
  }
  default:
    assert.fail(`unknown NTP fetcher scenario: ${process.argv[2]}`);
}

console.log(`ok ${process.argv[2]}`);
