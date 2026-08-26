import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  createConnection,
  createServer,
  Server,
  type AddressInfo,
  type Socket,
} from "node:net";
import { EventBroker } from "../src/event-broker.ts";

let broker: EventBroker | undefined;
let occupiedTcp: Server | undefined;
let occupiedWs: ReturnType<typeof Bun.serve> | undefined;
let client: Socket | undefined;

const rejectionReasons: Array<{ label: string; value: unknown }> = [
  { label: "undefined", value: undefined },
  { label: "null", value: null },
  { label: "false", value: false },
  { label: "zero", value: 0 },
  { label: "empty string", value: "" },
  { label: "Error", value: new Error("ordinary rejection") },
];

async function captureRejection(promise: PromiseLike<unknown>): Promise<{
  rejected: boolean;
  reason: unknown;
}> {
  return Promise.resolve(promise).then(
    () => ({ rejected: false, reason: undefined }),
    (reason) => ({ rejected: true, reason }),
  );
}

async function freeTcpPort(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await closeTcp(server);
    if (port > 10_000) return port;
  }
  throw new Error("Unable to acquire a free TCP port above 10000");
}

async function listenTcp(port: number): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return server;
}

async function closeTcp(server?: Server): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function connect(port: number): Promise<Socket> {
  const socket = createConnection({ port, host: "127.0.0.1" });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function expectTcpReusable(port: number): Promise<void> {
  const server = await listenTcp(port);
  await closeTcp(server);
}

async function expectWsReusable(port: number): Promise<void> {
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
  await server.stop(true);
}

beforeEach(async () => {
  process.env.MQTT_BROKER = "true";
  const tcpPort = await freeTcpPort();
  let wsPort = await freeTcpPort();
  while (wsPort === tcpPort) wsPort = await freeTcpPort();
  process.env.MQTT_ENGINE_BROKER_PORT = String(tcpPort);
  process.env.MQTT_ENGINE_BROKER_WS_PORT = String(wsPort);
});

afterEach(async () => {
  client?.destroy();
  client = undefined;
  if (broker) await broker.shutdown().catch(() => {});
  broker = undefined;
  await closeTcp(occupiedTcp);
  occupiedTcp = undefined;
  if (occupiedWs) await occupiedWs.stop(true);
  occupiedWs = undefined;
});

test("start awaits TCP and WebSocket readiness; shutdown releases both", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  broker = new EventBroker("effectstream-engine");
  await broker.start();
  client = await connect(tcpPort);
  const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`, "mqtt");
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket did not open"));
  });
  ws.close();
  await broker.shutdown();
  broker = undefined;
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("concurrent starts and shutdowns coalesce", async () => {
  broker = new EventBroker("effectstream-engine");
  const startA = broker.start();
  const startB = broker.start();
  expect(startA).toBe(startB);
  await startA;
  expect(broker.start()).toBe(startA);
  const stopA = broker.shutdown();
  const stopB = broker.shutdown();
  expect(stopA).toBe(stopB);
  await stopA;
});

test("shutdown before start is safe and start after shutdown is rejected", async () => {
  broker = new EventBroker("effectstream-engine");
  await broker.shutdown();
  await expect(broker.start()).rejects.toThrow(/cannot start from state STOPPED/);
});

test("shutdown racing TCP bind prevents late WebSocket creation", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  broker = new EventBroker("effectstream-engine");
  const starting = broker.start();
  const stopping = broker.shutdown();
  await expect(starting).rejects.toThrow(/cancelled by shutdown/);
  await stopping;
  broker = undefined;
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("TCP bind conflict rejects structurally and leaves WS untouched", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  occupiedTcp = await listenTcp(tcpPort);
  broker = new EventBroker("effectstream-engine");
  const error = await broker.start().catch((value) => value);
  expect((error as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  await expect(broker.start()).rejects.toThrow(/cannot start from state STOPPED/);
  await expectWsReusable(wsPort);
  await closeTcp(occupiedTcp);
  occupiedTcp = undefined;
  await expectTcpReusable(tcpPort);
});

test.each(rejectionReasons)(
  "partial shutdown rejection $label is retained after start failure",
  async ({ value }) => {
    const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
    occupiedTcp = await listenTcp(tcpPort);
    broker = new EventBroker("effectstream-engine");
    const internals = broker as any;
    internals.beginShutdown = async () => {
      throw value;
    };
    const result = await captureRejection(broker.start());
    expect(result.rejected).toBe(true);
    expect(result.reason).toBeInstanceOf(AggregateError);
    const failures = (result.reason as AggregateError).errors;
    expect((failures[0] as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
    expect(Object.is(failures[1], value)).toBe(true);
    broker = undefined;
  },
);

test.each(rejectionReasons)(
  "shutdown rejection $label is retained and replayed",
  async ({ value }) => {
    broker = new EventBroker("effectstream-engine");
    const internals = broker as any;
    internals.wsServer = {
      stop() {
        throw value;
      },
    };
    const first = broker.shutdown();
    const result = await captureRejection(first);
    expect(result.rejected).toBe(true);
    expect(Object.is(result.reason, value)).toBe(true);
    expect(broker.shutdown()).toBe(first);
    broker = undefined;
  },
);

test("WebSocket bind conflict cleans an already-started TCP listener", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  occupiedWs = Bun.serve({ hostname: "127.0.0.1", port: wsPort, fetch: () => new Response() });
  broker = new EventBroker("effectstream-engine");
  const error = await broker.start().catch((value) => value);
  expect((error as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  await expectTcpReusable(tcpPort);
});

test("start and partial-cleanup failures aggregate in start-first order", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  occupiedWs = Bun.serve({ hostname: "127.0.0.1", port: wsPort, fetch: () => new Response() });
  broker = new EventBroker("effectstream-engine");
  const closeError = new Error("partial TCP close failed");
  const realClose = Server.prototype.close;
  let retainedTcp: Server | undefined;
  Server.prototype.close = function (callback?: (error?: Error) => void) {
    retainedTcp = this;
    callback?.(closeError);
    return this;
  } as typeof Server.prototype.close;
  let error: unknown;
  try {
    error = await broker.start().catch((value) => value);
  } finally {
    Server.prototype.close = realClose;
  }
  expect(error).toBeInstanceOf(AggregateError);
  const failures = (error as AggregateError).errors;
  expect((failures[0] as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
  expect(failures[1]).toBe(closeError);
  expect(await broker.shutdown().catch((value) => value)).toBe(closeError);

  broker = undefined;
  await new Promise<void>((resolve) => realClose.call(retainedTcp!, () => resolve()));
  await occupiedWs.stop(true);
  occupiedWs = undefined;
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("shutdown destroys accepted TCP connections before resolving", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  broker = new EventBroker("effectstream-engine");
  await broker.start();
  client = await connect(tcpPort);
  const closed = new Promise<void>((resolve) => client!.once("close", () => resolve()));
  await broker.shutdown();
  await closed;
  expect(client.destroyed).toBe(true);
});

test("transport close failures aggregate in TCP then WebSocket order and replay", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  const wsPort = Number(process.env.MQTT_ENGINE_BROKER_WS_PORT);
  broker = new EventBroker("effectstream-engine");
  await broker.start();
  const tcpError = new Error("tcp close failed");
  const wsError = new Error("ws close failed");
  const internals = broker as any;
  const realTcpClose = internals.tcpServer.close.bind(internals.tcpServer);
  const realWsStop = internals.wsServer.stop.bind(internals.wsServer);
  internals.tcpServer.close = (callback: (error: Error) => void) => callback(tcpError);
  internals.wsServer.stop = () => {
    throw wsError;
  };
  const first = broker.shutdown();
  const second = broker.shutdown();
  expect(second).toBe(first);
  const error = await first.catch((value) => value);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([tcpError, wsError]);
  expect(await broker.shutdown().catch((value) => value)).toBe(error);
  broker = undefined;
  internals.tcpServer.close = realTcpClose;
  internals.wsServer.stop = realWsStop;
  await new Promise<void>((resolve) => realTcpClose(() => resolve()));
  await realWsStop(true);
  await expectTcpReusable(tcpPort);
  await expectWsReusable(wsPort);
});

test("legacy wrappers observe failures instead of producing unhandled rejections", async () => {
  const tcpPort = Number(process.env.MQTT_ENGINE_BROKER_PORT);
  occupiedTcp = await listenTcp(tcpPort);
  broker = new EventBroker("effectstream-engine");
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => unhandled.push(error);
  process.on("unhandledRejection", listener);
  const originalError = console.error;
  console.error = () => {};
  try {
    broker.createServer();
    await Bun.sleep(30);
    broker.stop();
    await Bun.sleep(10);
  } finally {
    console.error = originalError;
    process.removeListener("unhandledRejection", listener);
  }
  expect(unhandled).toEqual([]);
});
