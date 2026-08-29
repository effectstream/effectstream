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

type MqttQos = 0 | 1 | 2;

type MqttWill = {
  topic: string;
  payload: string;
  qos: MqttQos;
  retain: boolean;
};

function mqttConnectPacket(
  clientId: string,
  keepAlive: number,
  will?: MqttWill,
): Uint8Array {
  const encoder = new TextEncoder();
  const id = encoder.encode(clientId);
  const topic = will ? encoder.encode(will.topic) : new Uint8Array();
  const payload = will ? encoder.encode(will.payload) : new Uint8Array();
  const body = [
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54,
    0x04,
    will ? 0x02 | 0x04 | (will.qos << 3) | (will.retain ? 0x20 : 0) : 0x02,
    (keepAlive >> 8) & 0xff, keepAlive & 0xff,
    0x00, id.length, ...id,
    ...(will ? [0x00, topic.length, ...topic, 0x00, payload.length, ...payload] : []),
  ];
  if (body.length >= 128) throw new Error("test CONNECT packet is unexpectedly large");
  return new Uint8Array([0x10, body.length, ...body]);
}

function mqttDisconnectPacket(): Uint8Array {
  return new Uint8Array([0xe0, 0x00]);
}

function mqttPublishPacket(
  topicName: string,
  payloadText: string,
  qos: MqttQos,
  retain: boolean,
): Uint8Array {
  const encoder = new TextEncoder();
  const topic = encoder.encode(topicName);
  const payload = encoder.encode(payloadText);
  const packetId = qos === 0 ? [] : [0x00, 0x01];
  const body = [0x00, topic.length, ...topic, ...packetId, ...payload];
  if (body.length >= 128) throw new Error("test PUBLISH packet is unexpectedly large");
  return new Uint8Array([0x30 | (qos << 1) | (retain ? 0x01 : 0), body.length, ...body]);
}

function mqttPingRequestPacket(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

type PublishedPacket = {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
};

function capturePublishedPackets(broker: EventBroker): PublishedPacket[] {
  const internals = broker as any;
  const published: PublishedPacket[] = [];
  const persistence = internals.mqttServer.persistence;
  const realPublish = persistence.publish.bind(persistence);
  persistence.publish = (topic: string, packet: any) => {
    published.push({
      topic,
      payload: new TextDecoder().decode(packet.payload ?? new Uint8Array()),
      qos: packet.qos ?? 0,
      retain: packet.retain ?? false,
    });
    return realPublish(topic, packet);
  };
  return published;
}

async function connectMqttTcp(
  port: number,
  clientId: string,
  keepAlive: number,
  will?: MqttWill,
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
  will?: MqttWill,
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
      connectMqttTcp(tcpPort, "lifecycle-tcp", keepAlive, {
        topic: "lifecycle/will", payload: "tcp", qos: 0, retain: false,
      }),
      connectMqttWs(wsPort, "lifecycle-ws", keepAlive, {
        topic: "lifecycle/will", payload: "ws", qos: 0, retain: false,
      }),
    ]);
    await waitUntil(() => probe.captured.size === 2);
    const stopping = internals.shutdown();
    await withDeadline(stopping);
    probe.markShutdownSettled();
    expect(probe.cleared.size).toBe(2);
    expect(probe.clearEvents.length).toBeGreaterThanOrEqual(2);
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

test("exact-base routing preserves TCP Will policy and rejects WebSocket publishes and Wills", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  await broker.start();
  const published = capturePublishedPackets(broker);
  const deniedRemoteAddresses: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (args[0] === "Filtering MQTT publish from non-localhost:") {
      deniedRemoteAddresses.push(String(args[1]));
      return;
    }
    originalConsoleError(...args);
  };
  try {
    const tcpClientId = "routing-tcp-client";
    const wsClientId = "routing-ws-client";
    const [socket, ws] = await Promise.all([
      connectMqttTcp(tcpPort, tcpClientId, 1, {
        topic: "lifecycle/routing/will/tcp-qos2-retained",
        payload: "tcp-qos2-retained-payload",
        qos: 2,
        retain: true,
      }),
      connectMqttWs(wsPort, wsClientId, 1, {
        topic: "lifecycle/routing/will/ws-qos1-retained",
        payload: "ws-qos1-retained-payload",
        qos: 1,
        retain: true,
      }),
    ]);

    const pingResponse = new Promise<Uint8Array>((resolve, reject) => {
      ws.onmessage = (event) => resolve(new Uint8Array(event.data as ArrayBuffer));
      ws.onerror = () => reject(new Error("WebSocket routing barrier failed"));
    });
    ws.send(mqttPublishPacket(
      "lifecycle/routing/application/ws-retained",
      "must-not-route-from-unknown-ws",
      0,
      true,
    ));
    ws.send(mqttPingRequestPacket());
    expect(Array.from(await withDeadline(pingResponse))).toEqual([0xd0, 0x00]);

    socket.destroy();
    ws.close();
    await waitUntil(() => {
      const disconnected = published.filter((packet) =>
        packet.topic === "$SYS/disconnect/clients" &&
        (packet.payload === tcpClientId || packet.payload === wsClientId)
      );
      return disconnected.length === 2;
    }, 3_000);

    const application = published.filter((packet) =>
      packet.topic === "lifecycle/routing/application/ws-retained"
    );
    const wills = published.filter((packet) =>
      packet.topic.startsWith("lifecycle/routing/will/")
    );
    const disconnects = published.filter((packet) =>
      packet.topic === "$SYS/disconnect/clients" &&
      (packet.payload === tcpClientId || packet.payload === wsClientId)
    ).sort((left, right) => left.payload.localeCompare(right.payload));

    expect({ application, wills, disconnects, deniedRemoteAddresses }).toEqual({
      application: [],
      wills: [{
        topic: "lifecycle/routing/will/tcp-qos2-retained",
        payload: "tcp-qos2-retained-payload",
        qos: 2,
        retain: true,
      }],
      disconnects: [
        { topic: "$SYS/disconnect/clients", payload: tcpClientId, qos: 0, retain: false },
        { topic: "$SYS/disconnect/clients", payload: wsClientId, qos: 0, retain: false },
      ],
      deniedRemoteAddresses: ["unknown", "unknown"],
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("abrupt TCP and WebSocket peers preserve exact-base Will and system routing while clearing timers", async () => {
  const keepAlive = 181;
  const probe = instrumentKeepalive(keepAlive);
  try {
    const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const published = capturePublishedPackets(broker);
    const [socket, ws] = await Promise.all([
      connectMqttTcp(tcpPort, "abrupt-tcp-client", keepAlive, {
        topic: "lifecycle/will/tcp",
        payload: "abrupt-tcp-payload",
        qos: 2,
        retain: true,
      }),
      connectMqttWs(wsPort, "abrupt-ws-client", keepAlive, {
        topic: "lifecycle/will/ws",
        payload: "abrupt-ws-payload",
        qos: 1,
        retain: true,
      }),
    ]);
    const internals = broker as any;
    socket.destroy();
    ws.close();
    await waitUntil(() =>
      probe.cleared.size === probe.captured.size &&
      probe.cleared.size === 2 &&
      internals.connections.size === 0 &&
      published.filter((packet) => packet.topic === "$SYS/disconnect/clients").length === 2
    );
    expect(
      published.filter((packet) => packet.topic === "$SYS/disconnect/clients"),
    ).toEqual([
      { topic: "$SYS/disconnect/clients", payload: "abrupt-tcp-client", qos: 0, retain: false },
      { topic: "$SYS/disconnect/clients", payload: "abrupt-ws-client", qos: 0, retain: false },
    ]);
    expect(
      published.filter((packet) => packet.topic.startsWith("lifecycle/will/")),
    ).toEqual([
      { topic: "lifecycle/will/tcp", payload: "abrupt-tcp-payload", qos: 2, retain: true },
    ]);
    const probeSocket = await connectTcp(tcpPort);
    const probeWs = await connectWs(wsPort);
    probeSocket.destroy();
    probeWs.close();
    await internals.shutdown();
  } finally {
    probe.restore();
  }
});

test("graceful TCP and WebSocket DISCONNECT quiesces rearmed timers without Will or duplicate system routing", async () => {
  const keepAlive = 183;
  const probe = instrumentKeepalive(keepAlive);
  try {
    const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const published = capturePublishedPackets(broker);
    const [socket, ws] = await Promise.all([
      connectMqttTcp(tcpPort, "graceful-tcp-client", keepAlive, {
        topic: "lifecycle/will/graceful-tcp",
        payload: "must-not-publish-tcp",
        qos: 0,
        retain: false,
      }),
      connectMqttWs(wsPort, "graceful-ws-client", keepAlive, {
        topic: "lifecycle/will/graceful-ws",
        payload: "must-not-publish-ws",
        qos: 0,
        retain: false,
      }),
    ]);
    const wsClosed = new Promise<void>((resolve) => {
      ws.addEventListener("close", () => resolve(), { once: true });
    });
    socket.write(mqttDisconnectPacket());
    ws.send(mqttDisconnectPacket());
    const internals = broker as any;
    await waitUntil(() =>
      probe.captured.size === 4 &&
      probe.cleared.size === probe.captured.size &&
      internals.connections.size === 0
    );
    expect(
      published.filter((packet) => packet.topic === "$SYS/disconnect/clients"),
    ).toEqual([
      { topic: "$SYS/disconnect/clients", payload: "graceful-tcp-client", qos: 0, retain: false },
      { topic: "$SYS/disconnect/clients", payload: "graceful-ws-client", qos: 0, retain: false },
    ]);
    expect(published.filter((packet) => packet.topic.startsWith("lifecycle/will/"))).toEqual([]);
    // A gracefully disconnected WebSocket peer is released immediately; only
    // sockets still open when shutdown begins are left to Server.stop(true).
    await withDeadline(wsClosed);
    await withDeadline(internals.shutdown());
    await expectWsReusable(wsPort);
  } finally {
    probe.restore();
  }
});

test("timed-out WebSocket MQTT context preserves exact-base no-Will routing and closes the evicted socket", async () => {
  const keepAlive = 1;
  const probe = instrumentKeepalive(keepAlive);
  try {
    const [, wsPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const published = capturePublishedPackets(broker);
    const ws = await connectMqttWs(wsPort, "timeout-ws-client", keepAlive, {
      topic: "lifecycle/will/timeout-ws",
      payload: "timeout-ws-payload",
      qos: 0,
      retain: false,
    });
    const wsClosed = new Promise<void>((resolve) => {
      ws.addEventListener("close", () => resolve(), { once: true });
    });
    const internals = broker as any;
    await waitUntil(() =>
      internals.connections.size === 0 &&
      probe.captured.size === 1 &&
      probe.cleared.size === 1 &&
      published.some((packet) => packet.topic === "$SYS/disconnect/clients")
    , 2_500);
    expect(
      published.filter((packet) => packet.topic === "$SYS/disconnect/clients"),
    ).toEqual([
      { topic: "$SYS/disconnect/clients", payload: "timeout-ws-client", qos: 0, retain: false },
    ]);
    expect(
      published.filter((packet) => packet.topic === "lifecycle/will/timeout-ws"),
    ).toEqual([]);
    await withDeadline(wsClosed);
    await withDeadline(internals.shutdown());
    await expectWsReusable(wsPort);
  } finally {
    probe.restore();
  }
});

test("the authentication hook refuses CONNECTs once shutdown has begun", async () => {
  const broker = makeBroker();
  const internals = broker as any;
  const stopping = internals.shutdown();
  const result = internals.mqttServer.handlers.isAuthenticated({} as Context);
  expect(result).toBe(AuthenticationResult.serverUnavailable);
  await stopping;
});

test("a CONNECT racing shutdown never registers a session", async () => {
  const [tcpPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  await broker.start();
  const published = capturePublishedPackets(broker);
  const socket = await connectTcp(tcpPort);
  const internals = broker as any;
  await waitUntil(() => internals.connections.size === 1);
  const stopping = internals.shutdown();
  socket.write(mqttConnectPacket("shutdown-race-client", 7));
  await withDeadline(stopping);
  expect(
    published.filter((packet) =>
      packet.topic === "$SYS/connect/clients" && packet.payload === "shutdown-race-client"
    ),
  ).toEqual([]);
  expect(internals.connections.size).toBe(0);
});

test("shutdown synchronously claims close(false) and clears a timer rearmed by an in-flight handler", async () => {
  const keepAlive = 191;
  const probe = instrumentKeepalive(keepAlive);
  let releaseHandler!: () => void;
  const handlerGate = new Promise<void>((resolve) => { releaseHandler = resolve; });
  try {
    const [tcpPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    await broker.start();
    const published = capturePublishedPackets(broker);
    const socket = await connectMqttTcp(tcpPort, "in-flight-client", keepAlive, {
      topic: "lifecycle/will/in-flight",
      payload: "must-not-publish",
      qos: 0,
      retain: false,
    });
    const internals = broker as any;
    await waitUntil(() => [...internals.connections.values()].some((entry: any) => entry.context));
    const entry = [...internals.connections.values()].find((candidate: any) => candidate.context) as any;
    const context = entry.context as any;
    const closeModes: boolean[] = [];
    const realClose = context.close.bind(context);
    context.close = (executeWill = true) => {
      closeModes.push(executeWill);
      return realClose(executeWill);
    };
    let handlerEnteredResolve!: () => void;
    const handlerEntered = new Promise<void>((resolve) => { handlerEnteredResolve = resolve; });
    context.send = async () => {
      handlerEnteredResolve();
      await handlerGate;
    };
    socket.write(new Uint8Array([0xc0, 0x00]));
    await withDeadline(handlerEntered);
    const stopping = internals.shutdown();
    const modesBeforeFirstAwait = [...closeModes];
    const clearsBeforeRelease = probe.cleared.size;
    releaseHandler();
    await withDeadline(stopping);
    expect(modesBeforeFirstAwait).toEqual([false]);
    expect(clearsBeforeRelease).toBe(1);
    expect(closeModes).toEqual([false]);
    expect(probe.captured.size).toBe(2);
    expect(probe.cleared.size).toBe(probe.captured.size);
    expect(
      published.filter((packet) => packet.topic === "$SYS/disconnect/clients"),
    ).toEqual([
      { topic: "$SYS/disconnect/clients", payload: "in-flight-client", qos: 0, retain: false },
    ]);
    expect(published.filter((packet) => packet.topic === "lifecycle/will/in-flight")).toEqual([]);
    expect(internals.connections.size).toBe(0);
  } finally {
    releaseHandler?.();
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
  await expect(broker.start()).rejects.toThrow(/cannot start after shutdown/);
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

test("every post-readiness TCP error stays broker-owned and replays in emission order", async () => {
  const broker = makeBroker();
  await broker.start();
  const internals = broker as any;
  const firstRuntimeError = new Error("first post-ready TCP runtime failure");
  const secondRuntimeError = new Error("second post-ready TCP runtime failure");
  const uncaught: unknown[] = [];
  const onUncaught = (error: unknown) => { uncaught.push(error); };
  process.on("uncaughtException", onUncaught);
  try {
    for (const runtimeError of [firstRuntimeError, secondRuntimeError]) {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          try { internals.tcpServer.emit("error", runtimeError); }
          finally { resolve(); }
        }, 0);
      });
    }
    await Bun.sleep(0);
  } finally {
    process.removeListener("uncaughtException", onUncaught);
  }
  expect(uncaught).toEqual([]);
  const first = internals.shutdown();
  const second = internals.shutdown();
  expect(second).toBe(first);
  const result = await captureRejection(first);
  expect(result.rejected).toBe(true);
  expect(result.reason).toBeInstanceOf(AggregateError);
  expect((result.reason as AggregateError).errors).toEqual([
    firstRuntimeError,
    secondRuntimeError,
  ]);
  expect(internals.shutdown()).toBe(first);
});

test("a real queued TCP accept released after STOPPING is rejected and cannot strand shutdown", async () => {
  const [tcpPort] = brokerPorts("effectstream-engine");
  const broker = makeBroker();
  await broker.start();
  const internals = broker as any;
  const tcpServer = internals.tcpServer as Server;
  const realEmit = tcpServer.emit;
  let heldSocket: Socket | undefined;
  tcpServer.emit = ((event: string | symbol, ...args: any[]) => {
    if (event === "connection" && heldSocket === undefined) {
      heldSocket = args[0] as Socket;
      return true;
    }
    return realEmit.call(tcpServer, event, ...args);
  }) as typeof tcpServer.emit;
  const client = await connectTcp(tcpPort);
  await waitUntil(() => heldSocket !== undefined);
  const stopping = internals.shutdown();
  await Promise.resolve();
  realEmit.call(tcpServer, "connection", heldSocket!);
  const result = await captureRejection(withDeadline(stopping, 500));
  heldSocket?.destroy();
  client.destroy();
  expect(result.rejected).toBe(false);
  expect(heldSocket?.destroyed).toBe(true);
  expect(internals.tcpSockets.size).toBe(0);
  expect(internals.connections.size).toBe(0);
});

test("a WebSocket open callback observed after STOPPING closes without starting serve work", async () => {
  const [, wsPort] = brokerPorts("effectstream-engine");
  const realServe = Bun.serve.bind(Bun);
  let releaseOpen: ((ws: any) => void) | undefined;
  let heldWs: any;
  (Bun as any).serve = (options: any) => {
    const realOpen = options.websocket?.open;
    if (!realOpen) return realServe(options);
    releaseOpen = realOpen;
    return realServe({
      ...options,
      websocket: {
        ...options.websocket,
        open(ws: any) { heldWs = ws; },
      },
    });
  };
  const broker = makeBroker();
  try {
    await broker.start();
    await connectWs(wsPort);
    await waitUntil(() => heldWs !== undefined && releaseOpen !== undefined);
  } finally {
    (Bun as any).serve = realServe;
  }
  const internals = broker as any;
  const realMqttServe = internals.mqttServer.serve.bind(internals.mqttServer);
  let serveCalls = 0;
  internals.mqttServer.serve = (conn: SockConn) => {
    serveCalls++;
    return realMqttServe(conn);
  };
  const stopping = internals.shutdown();
  await Promise.resolve();
  releaseOpen!(heldWs);
  const result = await captureRejection(withDeadline(stopping, 500));
  await Bun.sleep(0);
  const retained = internals.connections.size;
  try { heldWs.data?.controller?.error(new Error("late-open test cleanup")); } catch {}
  try { heldWs.close(); } catch {}
  expect(result.rejected).toBe(false);
  expect(retained).toBe(0);
  expect(serveCalls).toBe(0);
});

test("TCP bind conflict rejects before deadline and failed instances cannot restart", async () => {
  const [tcpPort, wsPort] = brokerPorts("effectstream-engine");
  await listenTcp(tcpPort);
  const broker = makeBroker();
  const result = await withDeadline(captureRejection(broker.start()), 500);
  expect(result.rejected).toBe(true);
  expect((result.reason as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  await expect(broker.start()).rejects.toThrow(/cannot start after shutdown/);
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
    // The Context close is attempted exactly once (memoized), so the single
    // failure replays by identity rather than wrapped in an AggregateError.
    expect(Object.is(result.reason, value)).toBe(true);
    expect(internals.shutdown()).toBe(first);
    brokers.delete(broker);
  },
);

test.each(rejectionReasons)(
  "independent Context and serve stages preserve two ordered same-identity failures: $label",
  async ({ value }) => {
    const [tcpPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    const internals = broker as any;
    let contextCloseCalls = 0;
    let serveCalls = 0;
    internals.mqttServer.serve = (conn: SockConn) => {
      serveCalls++;
      internals.registerContext({
        conn,
        close: () => {
          contextCloseCalls++;
          throw value;
        },
      });
      return Promise.reject(value);
    };
    await broker.start();
    await connectTcp(tcpPort);
    await waitUntil(() => internals.connectionFailures.size === 1);
    const first = internals.shutdown();
    const result = await captureRejection(first);
    expect(result.rejected).toBe(true);
    expect(result.reason).toBeInstanceOf(AggregateError);
    const failures = (result.reason as AggregateError).errors;
    expect(failures).toHaveLength(2);
    expect(Object.is(failures[0], value)).toBe(true);
    expect(Object.is(failures[1], value)).toBe(true);
    expect(contextCloseCalls).toBe(1);
    expect(serveCalls).toBe(1);
    expect(internals.shutdown()).toBe(first);
  },
);

test.each(rejectionReasons)(
  "independent Context, timer, and serve stages preserve every same-identity failure: $label",
  async ({ value }) => {
    const [tcpPort] = brokerPorts("effectstream-engine");
    const broker = makeBroker();
    const internals = broker as any;
    let contextCloseCalls = 0;
    let timerClearCalls = 0;
    let serveCalls = 0;
    internals.mqttServer.serve = (conn: SockConn) => {
      serveCalls++;
      internals.registerContext({
        conn,
        close: () => {
          contextCloseCalls++;
          throw value;
        },
        timer: {
          clear: () => {
            timerClearCalls++;
            throw value;
          },
        },
      });
      return Promise.reject(value);
    };
    await broker.start();
    await connectTcp(tcpPort);
    await waitUntil(() => internals.connectionFailures.size === 1);
    const first = internals.shutdown();
    const result = await captureRejection(first);
    expect(result.rejected).toBe(true);
    expect(result.reason).toBeInstanceOf(AggregateError);
    const failures = (result.reason as AggregateError).errors;
    expect(failures).toHaveLength(3);
    expect(Object.is(failures[0], value)).toBe(true);
    expect(Object.is(failures[1], value)).toBe(true);
    expect(Object.is(failures[2], value)).toBe(true);
    expect(contextCloseCalls).toBe(1);
    expect(timerClearCalls).toBe(1);
    expect(serveCalls).toBe(1);
    expect(internals.shutdown()).toBe(first);
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
  expect((result.reason as AggregateError).errors).toEqual([
    contextError,
    tcpError,
    wsError,
  ]);
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
