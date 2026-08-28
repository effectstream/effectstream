import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  createConnection,
  createServer,
  Server,
  type AddressInfo,
  type Socket,
} from "node:net";
import { AuthenticationResult, MqttServer } from "@seriousme/opifex/server";
import type { Context, SockConn } from "@seriousme/opifex/server";
import { EventBroker } from "../src/event-broker.ts";

const envKeys = [
  "MQTT_BROKER",
  "MQTT_ENGINE_BROKER_PORT",
  "MQTT_ENGINE_BROKER_WS_PORT",
  "MQTT_BATCHER_BROKER_PORT",
  "MQTT_BATCHER_BROKER_WS_PORT",
] as const;

const rejectionReasons: Array<{ label: string; value: unknown }> = [
  { label: "undefined", value: undefined },
  { label: "null", value: null },
  { label: "false", value: false },
  { label: "zero", value: 0 },
  { label: "empty string", value: "" },
  { label: "Error", value: new Error("ordinary rejection") },
];

let savedEnv: Record<(typeof envKeys)[number], string | undefined>;
const brokers = new Set<EventBroker>();
const tcpClients = new Set<Socket>();
const webSockets = new Set<WebSocket>();
const occupiedTcp = new Set<Server>();
const occupiedWs = new Set<ReturnType<typeof Bun.serve>>();

async function captureRejection(promise: PromiseLike<unknown>): Promise<{
  rejected: boolean;
  reason: unknown;
}> {
  return Promise.resolve(promise).then(
    () => ({ rejected: false, reason: undefined }),
    (reason) => ({ rejected: true, reason }),
  );
}

async function withDeadline<T>(promise: PromiseLike<T>, ms = 2_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    Bun.sleep(ms).then(() => {
      throw new Error(`deadline exceeded after ${ms}ms`);
    }),
  ]);
}

async function waitUntil(check: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() >= end) throw new Error(`condition not met within ${ms}ms`);
    await Bun.sleep(5);
  }
}

async function closeTcp(server?: Server): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function freeTcpPort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await closeTcp(server);
    if (port > 10_000) return port;
  }
  throw new Error("Unable to acquire an OS-selected port above 10000");
}

async function freeDistinctPorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) ports.add(await freeTcpPort());
  return [...ports];
}

async function listenTcp(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  occupiedTcp.add(server);
  return server;
}

async function expectTcpReusable(port: number): Promise<void> {
  const server = await listenTcp(port);
  occupiedTcp.delete(server);
  await closeTcp(server);
}

async function expectWsReusable(port: number): Promise<void> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => new Response("ok"),
  });
  await server.stop(true);
}

async function connectTcp(port: number): Promise<Socket> {
  const socket = createConnection({ port, host: "127.0.0.1" });
  tcpClients.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function connectWs(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, "mqtt");
  ws.binaryType = "arraybuffer";
  webSockets.add(ws);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket did not open"));
  });
  return ws;
}

function mqttConnectPacket(
  clientId: string,
  keepAlive: number,
  will?: { topic: string; payload: string },
): Uint8Array {
  const encoder = new TextEncoder();
  const id = encoder.encode(clientId);
  const topic = will ? encoder.encode(will.topic) : new Uint8Array();
  const payload = will ? encoder.encode(will.payload) : new Uint8Array();
  const body = [
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54,
    0x04,
    will ? 0x06 : 0x02,
    (keepAlive >> 8) & 0xff, keepAlive & 0xff,
    0x00, id.length, ...id,
    ...(will ? [0x00, topic.length, ...topic, 0x00, payload.length, ...payload] : []),
  ];
  if (body.length >= 128) throw new Error("test CONNECT packet is unexpectedly large");
  return new Uint8Array([0x10, body.length, ...body]);
}

async function connectMqttTcp(
  port: number,
  clientId: string,
  keepAlive: number,
  will?: { topic: string; payload: string },
): Promise<Socket> {
  const socket = await connectTcp(port);
  const response = new Promise<Uint8Array>((resolve, reject) => {
    socket.once("data", (data) => {
      resolve(typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data));
    });
    socket.once("error", reject);
  });
  socket.write(mqttConnectPacket(clientId, keepAlive, will));
  expect(Array.from(await withDeadline(response))).toEqual([0x20, 0x02, 0x00, 0x00]);
  return socket;
}

async function connectMqttWs(
  port: number,
  clientId: string,
  keepAlive: number,
  will?: { topic: string; payload: string },
): Promise<WebSocket> {
  const ws = await connectWs(port);
  const response = new Promise<Uint8Array>((resolve, reject) => {
    ws.onmessage = (event) => resolve(new Uint8Array(event.data as ArrayBuffer));
    ws.onerror = () => reject(new Error("WebSocket MQTT handshake failed"));
  });
  ws.send(mqttConnectPacket(clientId, keepAlive, will));
  expect(Array.from(await withDeadline(response))).toEqual([0x20, 0x02, 0x00, 0x00]);
  return ws;
}

function brokerPorts(kind: "effectstream-engine" | "Batcher"): [number, number] {
  return kind === "effectstream-engine"
    ? [Number(process.env.MQTT_ENGINE_BROKER_PORT), Number(process.env.MQTT_ENGINE_BROKER_WS_PORT)]
    : [Number(process.env.MQTT_BATCHER_BROKER_PORT), Number(process.env.MQTT_BATCHER_BROKER_WS_PORT)];
}

function makeBroker(kind: "effectstream-engine" | "Batcher" = "effectstream-engine") {
  const broker = new EventBroker(kind);
  brokers.add(broker);
  return broker;
}

async function forceCleanupBroker(broker: EventBroker): Promise<void> {
  const internals = broker as any;
  if (typeof internals.shutdown === "function") {
    await withDeadline(internals.shutdown(), 1_000).catch(() => {});
  }
  for (const socket of internals.tcpSockets ?? []) socket.destroy();
  const tcpServer = internals.tcpServer as Server | undefined;
  if (tcpServer?.listening) await closeTcp(tcpServer);
  const wsServer = internals.wsServer as ReturnType<typeof Bun.serve> | undefined;
  if (wsServer) await Promise.resolve(wsServer.stop(true)).catch(() => {});
}

function instrumentKeepalive(keepAlive: number) {
  const expectedDelay = keepAlive * 1_500;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const captured = new Set<ReturnType<typeof setTimeout>>();
  const cleared = new Set<ReturnType<typeof setTimeout>>();
  const clearEvents: Array<{ handle: ReturnType<typeof setTimeout>; shutdownSettled: boolean }> = [];
  let shutdownSettled = false;

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const handle = originalSetTimeout(handler, timeout, ...args) as unknown as ReturnType<typeof setTimeout>;
    if (timeout === expectedDelay) captured.add(handle);
    return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle?: ReturnType<typeof setTimeout>) => {
    if (handle !== undefined && captured.has(handle)) {
      cleared.add(handle);
      clearEvents.push({ handle, shutdownSettled });
    }
    return originalClearTimeout(handle);
  }) as typeof clearTimeout;

  return {
    captured,
    cleared,
    clearEvents,
    markShutdownSettled: () => { shutdownSettled = true; },
    restore: () => {
      for (const handle of captured) originalClearTimeout(handle);
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

beforeEach(async () => {
  savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as typeof savedEnv;
  const [engineTcp, engineWs, batcherTcp, batcherWs] = await freeDistinctPorts(4);
  process.env.MQTT_BROKER = "true";
  process.env.MQTT_ENGINE_BROKER_PORT = String(engineTcp);
  process.env.MQTT_ENGINE_BROKER_WS_PORT = String(engineWs);
  process.env.MQTT_BATCHER_BROKER_PORT = String(batcherTcp);
  process.env.MQTT_BATCHER_BROKER_WS_PORT = String(batcherWs);
});

afterEach(async () => {
  for (const socket of tcpClients) socket.destroy();
  tcpClients.clear();
  for (const ws of webSockets) {
    try { ws.close(); } catch { /* already closed */ }
  }
  webSockets.clear();
  for (const broker of brokers) await forceCleanupBroker(broker);
  brokers.clear();
  for (const server of occupiedTcp) await closeTcp(server);
  occupiedTcp.clear();
  for (const server of occupiedWs) await Promise.resolve(server.stop(true)).catch(() => {});
  occupiedWs.clear();
  for (const key of envKeys) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("start resolves only after TCP and WebSocket readiness; shutdown releases both", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  await withDeadline(broker.start());
  const tcp = await connectTcp(tcpPort);
  const ws = await connectWs(wsPort);
  const tcpClosed = new Promise<void>((resolve) => tcp.once("close", resolve));
  const wsClosed = new Promise<void>((resolve) => ws.addEventListener("close", () => resolve(), { once: true }));
  await withDeadline((broker as any).shutdown());
  await withDeadline(Promise.all([tcpClosed, wsClosed]));
  expect((broker as any).connections?.size ?? 0).toBe(0);
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("engine and batcher coexist and fresh replacements reuse all four ports", async () => {
  const enginePorts = brokerPorts("effectstream-engine");
  const batcherPorts = brokerPorts("Batcher");
  const engine = makeBroker();
  const batcher = makeBroker("Batcher");
  await withDeadline(Promise.all([engine.start(), batcher.start()]));
  await Promise.all([
    connectTcp(enginePorts[0]), connectWs(enginePorts[1]),
    connectTcp(batcherPorts[0]), connectWs(batcherPorts[1]),
  ]);
  await withDeadline(Promise.all([(engine as any).shutdown(), (batcher as any).shutdown()]));
  const replacementEngine = makeBroker();
  const replacementBatcher = makeBroker("Batcher");
  await withDeadline(Promise.all([replacementEngine.start(), replacementBatcher.start()]));
  await withDeadline(Promise.all([
    (replacementEngine as any).shutdown(),
    (replacementBatcher as any).shutdown(),
  ]));
  for (const port of [enginePorts[0], batcherPorts[0]]) await expectTcpReusable(port);
  for (const port of [enginePorts[1], batcherPorts[1]]) await expectWsReusable(port);
});

test("real TCP and WebSocket keepalive timers clear before shutdown settles and no Will is emitted", async () => {
  const keepAlive = 173;
  const probe = instrumentKeepalive(keepAlive);
  try {
    const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const internals = broker as any;
    const published: string[] = [];
    const persistence = internals.mqttServer.persistence;
    const realPublish = persistence.publish.bind(persistence);
    persistence.publish = (topic: string, packet: unknown) => {
      if (topic === "lifecycle/will") published.push(topic);
      return realPublish(topic, packet);
    };
    await Promise.all([
      connectMqttTcp(tcpPort, "lifecycle-tcp", keepAlive, { topic: "lifecycle/will", payload: "tcp" }),
      connectMqttWs(wsPort, "lifecycle-ws", keepAlive, { topic: "lifecycle/will", payload: "ws" }),
    ]);
    await waitUntil(() => probe.captured.size === 2);
    const stopping = internals.shutdown();
    await withDeadline(stopping);
    probe.markShutdownSettled();
    expect(probe.cleared.size).toBe(2);
    expect(probe.clearEvents).toHaveLength(2);
    expect(probe.clearEvents.every((event) => event.shutdownSettled === false)).toBe(true);
    expect(published).toEqual([]);
    expect(internals.connections.size).toBe(0);
  } finally {
    probe.restore();
  }
});

test("raw Opifex transport close and serve-task drain alone do not clear keepalive", async () => {
  const keepAlive = 179;
  const probe = instrumentKeepalive(keepAlive);
  let context: Context | undefined;
  try {
    const readable = new ReadableStream<Uint8Array>({
      type: "bytes",
      start(controller) {
        controller.enqueue(Uint8Array.from(mqttConnectPacket("raw-gap", keepAlive)));
        controller.close();
      },
    });
    const writable = new WritableStream<Uint8Array>({ write() {} });
    const conn: SockConn = {
      readable,
      writable,
      close: () => {},
      remoteAddr: { hostname: "127.0.0.1", port: 12_345, transport: "tcp" },
    };
    const mqttServer = new MqttServer({
      handlers: {
        isAuthenticated: (ctx) => {
          context = ctx;
          return AuthenticationResult.ok;
        },
      },
    });
    const serving = mqttServer.serve(conn);
    await waitUntil(() => context !== undefined && probe.captured.size === 1);
    await withDeadline(serving);
    expect(probe.cleared.size).toBe(0);
    context!.close(false);
    expect(probe.cleared.size).toBe(1);
  } finally {
    context?.close(false);
    probe.restore();
  }
});

test("abrupt TCP and WebSocket disconnects finalize tracked contexts while broker stays running", async () => {
  const keepAlive = 181;
  const probe = instrumentKeepalive(keepAlive);
  try {
    const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const [socket, ws] = await Promise.all([
      connectMqttTcp(tcpPort, "abrupt-tcp-client", keepAlive, {
        topic: "lifecycle/will",
        payload: "must-not-publish-tcp",
      }),
      connectMqttWs(wsPort, "abrupt-ws-client", keepAlive, {
        topic: "lifecycle/will",
        payload: "must-not-publish-ws",
      }),
    ]);
    const internals = broker as any;
    const published: string[] = [];
    const persistence = internals.mqttServer.persistence;
    const realPublish = persistence.publish.bind(persistence);
    persistence.publish = (topic: string, packet: unknown) => {
      if (topic === "lifecycle/will") published.push(topic);
      return realPublish(topic, packet);
    };
    socket.destroy();
    ws.close();
    await waitUntil(() => probe.cleared.size === 2 && internals.connections.size === 0);
    expect(probe.cleared.size).toBe(2);
    expect(published).toEqual([]);
    const probeSocket = await connectTcp(tcpPort);
    const probeWs = await connectWs(wsPort);
    probeSocket.destroy();
    probeWs.close();
    await internals.shutdown();
  } finally {
    probe.restore();
  }
});

test("concurrent and settled starts share identity", async () => {
  const broker = makeBroker();
  const first = broker.start();
  const second = broker.start();
  expect(second).toBe(first);
  await first;
  expect(broker.start()).toBe(first);
  await (broker as any).shutdown();
});

test("shutdown before start is safe; repeated shutdown shares success", async () => {
  const broker = makeBroker();
  const first = (broker as any).shutdown();
  const second = (broker as any).shutdown();
  expect(second).toBe(first);
  await first;
  expect((broker as any).shutdown()).toBe(first);
  await expect(broker.start()).rejects.toThrow(/cannot start from state STOPPED/);
});

test("shutdown racing startup rejects start and prevents late WebSocket acquisition", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  const starting = broker.start();
  const stopping = (broker as any).shutdown();
  await expect(withDeadline(starting)).rejects.toThrow(/cancelled by shutdown/);
  await withDeadline(stopping);
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("TCP bind conflict rejects before deadline and failed instances cannot restart", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  await listenTcp(tcpPort);
  const broker = makeBroker();
  const result = await withDeadline(captureRejection(broker.start()), 500);
  expect(result.rejected).toBe(true);
  expect((result.reason as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  await expect(broker.start()).rejects.toThrow(/cannot start from state STOPPED/);
  await expectWsReusable(wsPort);
});

test("WebSocket bind conflict cleans the already-ready TCP listener", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  const occupied = Bun.serve({ hostname: "127.0.0.1", port: wsPort, fetch: () => new Response() });
  occupiedWs.add(occupied);
  const broker = makeBroker();
  const result = await withDeadline(captureRejection(broker.start()));
  expect(result.rejected).toBe(true);
  expect((result.reason as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  await expectTcpReusable(tcpPort);
});

test.each(rejectionReasons)(
  "start retains primary error before falsey partial-cleanup rejection: $label",
  async ({ value }) => {
    const [tcpPort] = brokerPorts("effectstream-engine");
    await listenTcp(tcpPort);
    const broker = makeBroker();
    (broker as any).beginShutdown = () => Promise.reject(value);
    const result = await withDeadline(captureRejection(broker.start()));
    expect(result.rejected).toBe(true);
    expect(result.reason).toBeInstanceOf(AggregateError);
    const failures = (result.reason as AggregateError).errors;
    expect((failures[0] as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
    expect(Object.is(failures[1], value)).toBe(true);
    brokers.delete(broker);
  },
);

test.each(rejectionReasons)(
  "shutdown retains and replays falsey WebSocket failure: $label",
  async ({ value }) => {
    const broker = makeBroker();
    await broker.start();
    const internals = broker as any;
    const realStop = internals.wsServer.stop.bind(internals.wsServer);
    internals.wsServer.stop = () => { throw value; };
    const first = internals.shutdown();
    const second = internals.shutdown();
    expect(second).toBe(first);
    const result = await captureRejection(first);
    expect(result.rejected).toBe(true);
    expect(Object.is(result.reason, value)).toBe(true);
    expect(internals.shutdown()).toBe(first);
    internals.wsServer.stop = realStop;
    await realStop(true);
    brokers.delete(broker);
  },
);

test.each(rejectionReasons)(
  "tracked Context.close failure retains falsey identity: $label",
  async ({ value }) => {
    const [tcpPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    await connectMqttTcp(tcpPort, `context-${String(value)}`, 0);
    const internals = broker as any;
    await waitUntil(() => [...internals.connections.values()].some((entry: any) => entry.context));
    const entry = [...internals.connections.values()].find((candidate: any) => candidate.context);
    entry.context.close = () => { throw value; };
    const first = internals.shutdown();
    const result = await captureRejection(first);
    expect(result.rejected).toBe(true);
    expect(Object.is(result.reason, value)).toBe(true);
    expect(internals.shutdown()).toBe(first);
    brokers.delete(broker);
  },
);

test("serve-task rejection is observed immediately and retained for shutdown", async () => {
  const [tcpPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  const internals = broker as any;
  const serveError = new Error("serve finalizer failed");
  internals.mqttServer.serve = () => Promise.reject(serveError);
  await broker.start();
  await connectTcp(tcpPort);
  await waitUntil(() => internals.connectionFailures?.size === 1);
  const result = await captureRejection(internals.shutdown());
  expect(result.rejected).toBe(true);
  expect(result.reason).toBe(serveError);
  brokers.delete(broker);
});

test("context, TCP, and WebSocket cleanup failures aggregate in shutdown order", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  await broker.start();
  await connectMqttTcp(tcpPort, "ordered-errors", 0);
  const internals = broker as any;
  await waitUntil(() => [...internals.connections.values()].some((entry: any) => entry.context));
  const entry = [...internals.connections.values()].find((candidate: any) => candidate.context);
  const contextError = new Error("context close failed");
  const tcpError = new Error("tcp close failed");
  const wsError = new Error("ws stop failed");
  entry.context.close = () => { throw contextError; };
  const tcpServer = internals.tcpServer as Server;
  const wsServer = internals.wsServer as ReturnType<typeof Bun.serve>;
  const realTcpClose = tcpServer.close.bind(tcpServer);
  const realWsStop = wsServer.stop.bind(wsServer);
  tcpServer.close = ((callback?: (error?: Error) => void) => {
    callback?.(tcpError);
    return tcpServer;
  }) as typeof tcpServer.close;
  wsServer.stop = (() => { throw wsError; }) as typeof wsServer.stop;
  const result = await captureRejection(internals.shutdown());
  expect(result.rejected).toBe(true);
  expect(result.reason).toBeInstanceOf(AggregateError);
  expect((result.reason as AggregateError).errors).toEqual([contextError, tcpError, wsError]);
  tcpServer.close = realTcpClose as typeof tcpServer.close;
  wsServer.stop = realWsStop as typeof wsServer.stop;
  await new Promise<void>((resolve) => realTcpClose(() => resolve()));
  await realWsStop(true);
  brokers.delete(broker);
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("legacy createServer/stop remain void and observe failures", async () => {
  const [tcpPort] = brokerPorts("effectstream-engine");
  await listenTcp(tcpPort);
  const broker = makeBroker();
  const unhandled: unknown[] = [];
  const logged: unknown[][] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  const originalError = console.error;
  process.on("unhandledRejection", listener);
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    expect(broker.createServer()).toBeUndefined();
    await Bun.sleep(40);
    expect((broker as any).stop()).toBeUndefined();
    await Bun.sleep(20);
  } finally {
    console.error = originalError;
    process.removeListener("unhandledRejection", listener);
  }
  expect(unhandled).toEqual([]);
  expect(logged.some((args) => String(args[0]).includes("failed to start"))).toBe(true);
});
