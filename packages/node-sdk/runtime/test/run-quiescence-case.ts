import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { mock } from "bun:test";
import fastify from "fastify";
import { ensure, suspend, until } from "effection";

async function freeTcpPort(excluded: ReadonlySet<number>): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (port > 10_000 && !excluded.has(port)) return port;
  }
  throw new Error("Unable to acquire a distinct free TCP port above 10000");
}

async function assertTcpReusable(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const ports = new Set<number>();
const brokerTcpPort = await freeTcpPort(ports);
ports.add(brokerTcpPort);
const brokerWsPort = await freeTcpPort(ports);
ports.add(brokerWsPort);
const httpPort = await freeTcpPort(ports);

process.env.MQTT_BROKER = "true";
process.env.MQTT_ENGINE_BROKER_PORT = String(brokerTcpPort);
process.env.MQTT_ENGINE_BROKER_WS_PORT = String(brokerWsPort);
process.env.EFFECTSTREAM_API_PORT = String(httpPort);

let telemetryStarts = 0;
let telemetryShutdowns = 0;
let poolEnds = 0;
let httpCloses = 0;
let processedBlocks = 0;
let outboundMessages = 0;
let resolveHttpReady!: () => void;
let resolveBlockProcessed!: () => void;
const httpReady = new Promise<void>((resolve) => {
  resolveHttpReady = resolve;
});
const blockProcessed = new Promise<void>((resolve) => {
  resolveBlockProcessed = resolve;
});

mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {
      telemetryStarts++;
    }
    async shutdown() {
      telemetryShutdowns++;
    }
  },
}));
mock.module("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: () => [],
}));
mock.module("@opentelemetry/api", () => ({
  default: { trace: { getTracer: () => ({}) } },
}));

mock.module("@effectstream/log", () => ({
  ComponentNames: {
    EFFECTSTREAM_RUNTIME: "runtime",
    EFFECTSTREAM_SYNC: "sync",
  },
  SeverityNumber: { INFO: 9, WARN: 13 },
  log: { local() {}, remote() {} },
  defaultOtelSetup: () => ({}),
  PaimaTelemetryContext: {
    set: function* () {},
  },
}));

const pool = {
  async connect() {
    return { release() {} };
  },
  async end() {
    poolEnds++;
  },
};
mock.module("@effectstream/db", () => ({
  acquireDBMutex: function* () {},
  createDynamicTables: function* () {},
  detectCapabilities: async () => ({}),
  getConnection: () => pool,
  getLastNonEmptyBlockHash: { run: async () => [] },
  releaseDBMutex() {},
  resetPublicTables: function* () {},
  runSnapshotLoop: function* () { yield* suspend(); },
  selectViewStrategy: () => "views",
}));
mock.module("@effectstream/db/version", () => ({
  getVersionInfo: function* () { return {}; },
  getLastBlockHeight: function* () { return 0; },
}));

mock.module("@effectstream/config", () => ({
  ConfigNetworkType: { NTP: "ntp", TEST: "test" },
  getWriteNamespace: () => undefined,
  usePaimaStaticConfig: function* () {
    return { securityNamespace: {} };
  },
  withEffectstreamStaticConfig: function* (
    _config: unknown,
    continuation: () => Generator,
  ) {
    yield* continuation();
  },
}));

const syncProtocol = {
  name: "quiescence-test",
  config: { networkType: "test" },
  lastPage: undefined,
  consecutiveErrors: 0,
  lastErrorTimestamp: 0,
  lastSuccessfulFetchMs: 0,
  bufferedData: { size: () => 0 },
};
mock.module("@effectstream/sync", () => ({
  genSyncProtocols: function* () { return [syncProtocol]; },
  startMerge: function* () { yield* suspend(); },
  startSync: function* () {},
}));
mock.module("@effectstream/event-client", () => ({
  BuiltinEvents: {
    RollupBlock: { path: ["rollup"] },
    SyncChains: { path: ["sync"] },
  },
  EventManager: {
    Instance: {
      sendMessage: async () => {
        outboundMessages++;
      },
    },
  },
}));
mock.module("@effectstream/sm", () => ({
  builtInPrimitivesMap: {},
}));

mock.module("../src/api/http-server.ts", () => ({
  startHttpServer: function* () {
    const server = fastify();
    yield* ensure(function* () {
      if (server.server.listening) yield* until(server.close());
      httpCloses++;
    });
    yield* until(server.listen({ port: httpPort, host: "127.0.0.1" }));
    resolveHttpReady();
    yield* suspend();
  },
}));
mock.module("../src/version-migrations.ts", () => ({
  applySystemMigrations: function* () {},
}));
mock.module("../src/config-snapshot.ts", () => ({
  validateAndSnapshotConfig: function* () {},
}));
mock.module("../src/finalized-stream.ts", () => ({
  createBoundedFinalizedStream: function* () {
    return { stream: {}, subscription: {} };
  },
}));

let firstAdvance = true;
mock.module("../src/coalesce.ts", () => ({
  initMergeCoalescingBoundaries: function* () {},
  createEmptyBlockCoalescer: () => ({
    advance: function* () {
      if (firstAdvance) {
        firstAdvance = false;
        return {
          blockNumber: 1,
          timestamp: Date.now(),
          blockInfo: [],
        };
      }
      yield* suspend();
    },
  }),
}));
mock.module("../src/process-blocks.ts", () => ({
  processFinalizedBlockWithRetry: function* () {
    processedBlocks++;
    resolveBlockProcessed();
    return {
      blockHash: "0x1",
      events: [{ event: { path: ["app"] }, payload: {} }],
    };
  },
}));
mock.module("../src/api/apply-status.ts", () => ({
  recordAppliedBlock() {},
}));
mock.module("../src/api/stream-status.ts", () => ({
  recordCoalesced() {},
}));

const { runEffectstream, RunEffectstreamError } = await import("../src/process.ts");
const controller = new AbortController();
const reason = new Error("quiescence requested");
const running = runEffectstream({
  staticConfig: {
    securityNamespace: {},
    allNetworks: { viemNetworks: {} },
  } as any,
  startConfig: {
    appName: "run-quiescence-test",
    appVersion: "1.0.0",
    syncInfo: [],
    events: false,
  },
  processSignals: false,
  signal: controller.signal,
});

await Promise.all([httpReady, blockProcessed]);
controller.abort(reason);
const error = await running.catch((value) => value);
assert(error instanceof RunEffectstreamError);
assert.equal(error.code, "ABORTED");
assert.equal(error.cause, reason);
assert.equal(telemetryStarts, 1);
assert.equal(telemetryShutdowns, 1);
assert.equal(poolEnds, 1);
assert.equal(httpCloses, 1);
assert.equal(processedBlocks, 1);
assert.equal(outboundMessages, 0);

await assertTcpReusable(httpPort);
await assertTcpReusable(brokerTcpPort);
const reboundWs = Bun.serve({
  hostname: "127.0.0.1",
  port: brokerWsPort,
  fetch: () => new Response(),
});
await reboundWs.stop(true);

console.log("ok");
