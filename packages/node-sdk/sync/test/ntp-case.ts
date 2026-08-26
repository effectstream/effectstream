import assert from "node:assert/strict";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { NtpTimeSync } from "ntp-time-sync";
import { call, run } from "effection";
import { ConfigNetworkType } from "@effectstream/config";
import { NtpFetcher } from "../src/sync-protocols/ntp/fetcher.ts";

type Responder = (request: Buffer, remote: RemoteInfo, socket: Socket, hit: number) => void;

async function startUdp(responder: Responder) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
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
        await new Promise<void>((resolve) => socket.close(() => resolve()));
        continue;
      }
      let hits = 0;
      socket.on("message", (message, remote) => {
        hits++;
        responder(message, remote, socket, hits);
      });
      return {
        socket,
        port,
        hits: () => hits,
        async close() {
          await new Promise<void>((resolve) => socket.close(() => resolve()));
        },
      };
    } catch (error) {
      lastError = error;
      try {
        socket.close();
      } catch {
        // The bind failure may already have closed it.
      }
    }
  }
  throw lastError;
}

function writeTimestamp(buffer: Buffer, offset: number, unixMs: number): void {
  const ntpMs = unixMs + 2_208_988_800_000;
  const seconds = Math.floor(ntpMs / 1000);
  const fraction = Math.floor(((ntpMs % 1000) / 1000) * 2 ** 32);
  buffer.writeUInt32BE(seconds >>> 0, offset);
  buffer.writeUInt32BE(fraction >>> 0, offset + 4);
}

function responseFor(request: Buffer, clockOffsetMs = 0): Buffer {
  const response = Buffer.alloc(48);
  response[0] = (4 << 3) | 4; // synchronized, NTP v4, server mode
  response[1] = 1; // primary stratum
  response[2] = 4;
  response[3] = 0xec; // precision -20
  response.write("LOCL", 12, 4, "ascii");
  const now = Date.now() + clockOffsetMs;
  writeTimestamp(response, 16, now - 1000);
  request.copy(response, 24, 40, 48); // echo the client's transmit timestamp
  writeTimestamp(response, 32, now);
  writeTimestamp(response, 40, now);
  return response;
}

const validResponder = (clockOffsetMs = 0): Responder =>
  (request, remote, socket) => {
    socket.send(responseFor(request, clockOffsetMs), remote.port, remote.address);
  };

function config(servers?: string[]) {
  return {
    networkType: ConfigNetworkType.NTP,
    network: {
      name: "controlled-clock",
      type: ConfigNetworkType.NTP,
      blockTimeMS: 1000,
      startTime: 0,
      servers,
    },
    syncProtocol: { name: "controlled-clock" },
  } as any;
}

async function assertPortReusable(port: number): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "127.0.0.1", () => resolve());
  });
  await new Promise<void>((resolve) => socket.close(() => resolve()));
}

switch (process.argv[2]) {
  case "defaults": {
    const absent = new NtpFetcher(config());
    const empty = new NtpFetcher(config([]));
    assert.equal(absent.ntpTimeSync, empty.ntpTimeSync);
    break;
  }
  case "configured-after-singleton": {
    const serverA = await startUdp(validResponder());
    const serverB = await startUdp(validResponder());
    try {
      const singleton = NtpTimeSync.getInstance({
        servers: [`127.0.0.1:${serverA.port}`],
        sampleCount: 1,
        replyTimeout: 50,
      });
      await singleton.getTime();
      assert.equal(serverA.hits(), 1);
      const fetcher = new NtpFetcher(config([`127.0.0.1:${serverB.port}`]));
      await fetcher.ntpTimeSync.getTime();
      assert.equal(serverA.hits(), 1);
      assert.equal(serverB.hits(), 8);
    } finally {
      await serverA.close();
      await serverB.close();
      await assertPortReusable(serverA.port);
      await assertPortReusable(serverB.port);
    }
    break;
  }
  case "isolated-caches": {
    const serverA = await startUdp(validResponder());
    const serverB = await startUdp(validResponder());
    try {
      const a = new NtpFetcher(config([`127.0.0.1:${serverA.port}`]));
      const b = new NtpFetcher(config([`127.0.0.1:${serverB.port}`]));
      assert.notEqual(a.ntpTimeSync, b.ntpTimeSync);
      await a.ntpTimeSync.getTime();
      assert.equal(serverA.hits(), 8);
      assert.equal(serverB.hits(), 0);
      await b.ntpTimeSync.getTime();
      assert.equal(serverB.hits(), 8);
      await a.ntpTimeSync.getTime();
      await b.ntpTimeSync.getTime();
      assert.equal(serverA.hits(), 8);
      assert.equal(serverB.hits(), 8);
    } finally {
      await serverA.close();
      await serverB.close();
      await assertPortReusable(serverA.port);
      await assertPortReusable(serverB.port);
    }
    break;
  }
  case "partial": {
    const server = await startUdp((request, remote, socket, hit) => {
      if (hit === 1) socket.send(responseFor(request), remote.port, remote.address);
    });
    try {
      const client = new NtpTimeSync({
        servers: [`127.0.0.1:${server.port}`],
        sampleCount: 2,
        replyTimeout: 25,
      });
      const started = Date.now();
      const result = await client.getTime();
      assert(Number.isFinite(result.offset));
      assert.equal(server.hits(), 4);
      assert(Date.now() - started < 1000);
    } finally {
      await server.close();
      await assertPortReusable(server.port);
    }
    break;
  }
  case "zero": {
    const server = await startUdp(() => {});
    try {
      const client = new NtpTimeSync({
        servers: [`127.0.0.1:${server.port}`],
        sampleCount: 1,
        replyTimeout: 20,
      });
      const started = Date.now();
      await assert.rejects(client.getTime(), /Unable to get any NTP response/);
      assert.equal(server.hits(), 3);
      assert(Date.now() - started < 1000);
    } finally {
      await server.close();
      await assertPortReusable(server.port);
    }
    break;
  }
  case "malformed": {
    const server = await startUdp((_request, remote, socket) => {
      socket.send(Buffer.alloc(7), remote.port, remote.address);
    });
    try {
      const client = new NtpTimeSync({
        servers: [`127.0.0.1:${server.port}`],
        sampleCount: 1,
        replyTimeout: 30,
      });
      await assert.rejects(client.getTime(), /Unable to get any NTP response/);
      assert.equal(server.hits(), 3);
    } finally {
      await server.close();
      await assertPortReusable(server.port);
    }
    break;
  }
  case "retry-recovery": {
    const server = await startUdp((request, remote, socket, hit) => {
      if (hit > 1) socket.send(responseFor(request), remote.port, remote.address);
    });
    try {
      const client = new NtpTimeSync({
        servers: [`127.0.0.1:${server.port}`],
        sampleCount: 1,
        replyTimeout: 25,
      });
      await client.getTime();
      assert.equal(server.hits(), 2);
    } finally {
      await server.close();
      await assertPortReusable(server.port);
    }
    break;
  }
  case "synchronous-send-error": {
    const client = new NtpTimeSync({
      servers: ["127.0.0.1:12345"],
      sampleCount: 1,
      replyTimeout: 20,
    });
    const expected = new Error("packet construction failed");
    (client as any).createPacket = () => {
      throw expected;
    };
    await assert.rejects(client.getNetworkTime("127.0.0.1", 12345), (error) => {
      assert.equal(error, expected);
      return true;
    });
    break;
  }
  case "halt-in-flight": {
    const server = await startUdp(() => {});
    try {
      const client = new NtpTimeSync({
        servers: [`127.0.0.1:${server.port}`],
        sampleCount: 1,
        replyTimeout: 20,
      });
      const task = run(function* () {
        yield* call(() => client.getTime());
      });
      void task.catch(() => {});
      while (server.hits() === 0) await new Promise((resolve) => setTimeout(resolve, 1));
      await task.halt();
      // Effection cannot cancel the dependency Promise. Its finite retry loop
      // must still settle and release every UDP client socket shortly after.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(server.hits(), 3);
    } finally {
      await server.close();
      await assertPortReusable(server.port);
    }
    break;
  }
  case "offset-signs": {
    const ahead = await startUdp(validResponder(2000));
    const behind = await startUdp(validResponder(-2000));
    try {
      const aheadResult = await new NtpTimeSync({
        servers: [`127.0.0.1:${ahead.port}`],
        sampleCount: 1,
        replyTimeout: 50,
      }).getTime();
      const behindResult = await new NtpTimeSync({
        servers: [`127.0.0.1:${behind.port}`],
        sampleCount: 1,
        replyTimeout: 50,
      }).getTime();
      assert(aheadResult.offset > 1000);
      assert(behindResult.offset < -1000);
    } finally {
      await ahead.close();
      await behind.close();
      await assertPortReusable(ahead.port);
      await assertPortReusable(behind.port);
    }
    break;
  }
  case "offset-warnings": {
    const fetcher = new NtpFetcher(config());
    const originalConsoleError = console.error;
    const warnings: string[] = [];
    console.error = (...values: unknown[]) => warnings.push(values.join(" "));
    try {
      for (const offset of [6001, -6001, 5000, -5000]) {
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
    assert.fail(`Unknown NTP scenario: ${process.argv[2]}`);
}

console.log("ok");
