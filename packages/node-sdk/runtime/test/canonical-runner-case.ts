import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:net";
import { mock } from "bun:test";
import { ensure, suspend, until } from "effection";
import pg from "pg";

const OWNED_KEYS = [
  "PGLITE",
  "PGLITE_DATA_DIR",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_NAME",
  "DB_PW",
  "MQTT_BROKER",
] as const;
type OwnedKey = (typeof OWNED_KEYS)[number];
type Database =
  | { type: "pglite"; dataDir?: string; port?: number }
  | {
    type: "postgres";
    host: string;
    port: number;
    user: string;
    database: string;
    password?: string;
  };
type MatrixCase = {
  ambient?: Partial<Record<OwnedKey, string>>;
  database?: Database;
  messaging?: boolean;
  namespace?: "omitted" | "string" | "historical";
  apiPort?: "absent";
  actualPort?: number;
  outcome?:
    | "success"
    | "startup-failure"
    | "runtime-failure"
    | "cancel"
    | "acquisition-failure"
    | "pglite-cleanup-failure"
    | "pool-pglite-cleanup-failure";
  expected: Record<OwnedKey, string | null>;
  expectedStartPort?: number;
};

const scenario = process.argv[2];
const matrix = scenario === "matrix"
  ? JSON.parse(process.argv[3]) as MatrixCase
  : undefined;
const realPglite = scenario === "real-pglite" ||
  scenario === "real-pglite-ephemeral";
const realService = realPglite || scenario === "real-postgres";

for (const key of OWNED_KEYS) delete process.env[key];
for (const [key, value] of Object.entries(matrix?.ambient ?? {})) {
  process.env[key] = value;
}
if (matrix?.apiPort === "absent") delete process.env.EFFECTSTREAM_API_PORT;
else process.env.EFFECTSTREAM_API_PORT = "18444";
process.env.EFFECTSTREAM_RUNNER_UNRELATED = "preserve-me";

const originalOwned = Object.fromEntries(
  OWNED_KEYS.map((key) => [key, {
    present: Object.prototype.hasOwnProperty.call(process.env, key),
    value: process.env[key],
  }]),
) as Record<OwnedKey, { present: boolean; value: string | undefined }>;
const originalApi = {
  present: Object.prototype.hasOwnProperty.call(process.env, "EFFECTSTREAM_API_PORT"),
  value: process.env.EFFECTSTREAM_API_PORT,
};

const events: string[] = [];
const startupError = new Error("canonical startup failed");
const runtimeError = new Error("canonical runtime failed");
const acquisitionError = new Error("PGlite acquisition failed");
const poolCloseError = new Error("pool close failed");
const pgliteCloseError = new Error("PGlite close failed");
let startPort: number | undefined;
let convertedConfig: unknown;
let staticConfig: any;
let observedStartConfig: any;
let observedMachine: unknown;
let realObservedPort: number | undefined;
let resolveStarted!: () => void;
const started = new Promise<void>((resolve) => {
  resolveStarted = resolve;
});

function assertDuring(expected: Record<OwnedKey, string | null>): void {
  for (const key of OWNED_KEYS) {
    const value = expected[key];
    if (value === null) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(process.env, key),
        false,
        `${key} should be absent during the run`,
      );
    } else {
      assert.equal(process.env[key], value, `${key} during the run`);
    }
  }
  assert.equal(process.env.EFFECTSTREAM_API_PORT, originalApi.value);
  assert.equal(process.env.EFFECTSTREAM_RUNNER_UNRELATED, "preserve-me");
}

mock.module("@effectstream/config", () => ({
  toSyncProtocolWithNetwork(config: unknown) {
    convertedConfig = config;
    return [{ canonical: "fresh-sync-info" }];
  },
  withEffectstreamStaticConfig: function* (
    config: unknown,
    continuation: () => Generator,
  ) {
    staticConfig = config;
    yield* continuation();
  },
}));

if (!realPglite) {
  mock.module("@effectstream/db/start-pglite", () => ({
    startPglite: async (port: number) => {
      startPort = port;
      events.push("pglite-start");
      if (matrix?.outcome === "acquisition-failure") throw acquisitionError;
      return {
        port: matrix?.actualPort ?? (port === 0 ? 41_337 : port),
        async close(options?: { force?: boolean }) {
          events.push("pglite-close");
          assert.deepEqual(options, { force: true });
          if (
            matrix?.outcome === "pglite-cleanup-failure" ||
            matrix?.outcome === "pool-pglite-cleanup-failure"
          ) {
            throw pgliteCloseError;
          }
        },
      };
    },
  }));
}

mock.module("../src/main.ts", () => ({
  init: function* () {
    events.push("init");
    if (matrix?.outcome === "startup-failure") throw startupError;
  },
  startCanonical: function* (startConfig: unknown, stateMachine: unknown) {
    observedStartConfig = startConfig;
    observedMachine = stateMachine;
    events.push("start");
    if (matrix) assertDuring(matrix.expected);

    if (realService) {
      realObservedPort = Number(process.env.DB_PORT);
      const pool = new pg.Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        password: process.env.PGLITE === "true" ? undefined : process.env.DB_PW,
        max: 1,
      });
      yield* ensure(function* () {
        events.push("pool-close");
        yield* until(pool.end());
      });
      const result = yield* until(pool.query(
        "select current_user as current_user, current_database() as current_database, 1 as answer",
      ));
      assert.equal(result.rows[0].answer, 1);
      if (scenario === "real-postgres") {
        assert.equal(result.rows[0].current_user, process.env.DB_USER);
        assert.equal(result.rows[0].current_database, process.env.DB_NAME);
      }
      return;
    }

    yield* ensure(function* () {
      events.push("pool-close");
      if (matrix?.outcome === "pool-pglite-cleanup-failure") {
        throw poolCloseError;
      }
    });
    resolveStarted();
    if (matrix?.outcome === "runtime-failure") throw runtimeError;
    if (matrix?.outcome === "cancel") yield* suspend();
  },
}));

const { runEffectstream, RunEffectstreamError } = await import("../src/process.ts");

function baseConfig(namespace: unknown) {
  return {
    securityNamespace: namespace,
    allNetworks: { networks: {}, viemNetworks: {} },
    deployedAddresses: {},
    syncProtocols: {},
    primitives: {},
  };
}

const stateMachine = {
  grammar: {},
  bindGrammar() {},
  *processInput() {},
};
const apiRouter = async () => {};

function assertRestored(): void {
  for (const key of OWNED_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(process.env, key),
      originalOwned[key].present,
      `${key} presence after settle`,
    );
    assert.equal(process.env[key], originalOwned[key].value, `${key} after settle`);
  }
  assert.equal(
    Object.prototype.hasOwnProperty.call(process.env, "EFFECTSTREAM_API_PORT"),
    originalApi.present,
  );
  assert.equal(process.env.EFFECTSTREAM_API_PORT, originalApi.value);
  assert.equal(process.env.EFFECTSTREAM_RUNNER_UNRELATED, "preserve-me");
}

async function freeTcpPort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (port > 10_000) return port;
  }
  throw new Error("Unable to acquire a free port above 10000");
}

async function assertTcpReusable(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

if (scenario === "matrix") {
  assert(matrix);
  const namespace = matrix.namespace === "string"
    ? "explicit-namespace"
    : matrix.namespace === "historical"
    ? { read: [{ block_height: 0, prefixes: ["old"] }], write: "new" }
    : undefined;
  const config = baseConfig(namespace);
  const before = structuredClone(config);
  const controller = new AbortController();
  const options = {
    appName: "canonical-runner-test",
    appVersion: "1.2.3" as const,
    config: config as any,
    stateMachine: stateMachine as any,
    apiRouter,
    ...(matrix.database === undefined ? {} : { database: matrix.database }),
    ...(matrix.messaging === undefined ? {} : { messaging: matrix.messaging }),
    processSignals: false as const,
    ...(matrix.outcome === "cancel" ? { signal: controller.signal } : {}),
  };
  const running = runEffectstream(options);
  if (matrix.outcome === "cancel") {
    await started;
    controller.abort("matrix cancellation");
  }
  const result = await running.then(
    () => ({ ok: true as const }),
    (error) => ({ ok: false as const, error }),
  );

  const expectedFailure = matrix.outcome && matrix.outcome !== "success";
  assert.equal(result.ok, !expectedFailure);
  if (!result.ok) {
    assert(result.error instanceof RunEffectstreamError);
    if (matrix.outcome === "cancel") {
      assert.equal(result.error.code, "ABORTED");
      assert.equal(result.error.cause, "matrix cancellation");
    } else {
      assert.equal(result.error.code, "RUN_FAILED");
    }
    if (matrix.outcome === "startup-failure") {
      assert.deepEqual(result.error.failures, [startupError]);
    } else if (matrix.outcome === "runtime-failure") {
      assert.deepEqual(result.error.failures, [runtimeError]);
    } else if (matrix.outcome === "acquisition-failure") {
      assert.deepEqual(result.error.failures, [acquisitionError]);
    } else if (matrix.outcome === "pglite-cleanup-failure") {
      assert.deepEqual(result.error.failures, [pgliteCloseError]);
    } else if (matrix.outcome === "pool-pglite-cleanup-failure") {
      assert.deepEqual(result.error.failures, [poolCloseError, pgliteCloseError]);
    }
  }

  assert.equal(convertedConfig, config);
  assert.deepEqual(config, before);
  if (matrix.outcome !== "acquisition-failure" && matrix.outcome !== "startup-failure") {
    assert.equal(staticConfig.securityNamespace, namespace ?? "canonical-runner-test");
    assert.equal(staticConfig.allNetworks, config.allNetworks);
  }
  if (matrix.outcome !== "acquisition-failure" && matrix.outcome !== "startup-failure") {
    assert.equal(observedStartConfig.appName, "canonical-runner-test");
    assert.equal(observedStartConfig.appVersion, "1.2.3");
    assert.equal(observedStartConfig.apiRouter, apiRouter);
    assert.equal(observedStartConfig.events, matrix.messaging === true);
    assert.deepEqual(observedStartConfig.syncInfo, [{ canonical: "fresh-sync-info" }]);
    assert.equal(observedMachine, stateMachine);
  }
  if ((matrix.database ?? { type: "pglite" }).type === "pglite") {
    assert.equal(startPort, matrix.expectedStartPort ?? 0);
    if (matrix.outcome !== "acquisition-failure") {
      const poolClose = events.indexOf("pool-close");
      const pgliteClose = events.indexOf("pglite-close");
      if (matrix.outcome !== "startup-failure") {
        assert(poolClose >= 0);
        assert(pgliteClose > poolClose);
      } else {
        assert(pgliteClose >= 0);
      }
    }
  } else {
    assert.equal(events.includes("pglite-start"), false);
    assert.equal(events.includes("pglite-close"), false);
  }
  if (matrix.apiPort === "absent") {
    const { ENV } = await import("@effectstream/utils/node-env");
    assert.equal(ENV.EFFECTSTREAM_API_PORT, 9_999);
  }
  assertRestored();
} else if (scenario === "invalid-does-not-claim") {
  const config = baseConfig(undefined);
  const oldShape = await runEffectstream({
    staticConfig: {},
    startConfig: {},
  } as any).catch((error) => error);
  assert(oldShape instanceof RunEffectstreamError);
  assert.equal(oldShape.code, "INVALID_OPTIONS");

  await runEffectstream({
    appName: "valid-after-invalid",
    appVersion: "1.0.0",
    config: config as any,
    stateMachine: stateMachine as any,
    apiRouter,
    database: {
      type: "postgres",
      host: "127.0.0.1",
      port: 54_399,
      user: "postgres",
      database: "postgres",
    },
    processSignals: false,
  });
  assertRestored();
} else if (realPglite) {
  const port = await freeTcpPort();
  const config = baseConfig(undefined);
  await runEffectstream({
    appName: "canonical-real-pglite",
    appVersion: "1.0.0",
    config: config as any,
    stateMachine: stateMachine as any,
    apiRouter,
    ...(scenario === "real-pglite"
      ? { database: { type: "pglite" as const, port } }
      : {}),
    processSignals: false,
  });
  assert.equal(events[events.length - 1], "pool-close");
  assert(Number.isSafeInteger(realObservedPort) && realObservedPort! > 10_000);
  assertRestored();
  await assertTcpReusable(realObservedPort!);
} else if (scenario === "real-postgres") {
  const port = Number(process.env.EFFECTSTREAM_TEST_PG_PORT);
  assert(Number.isSafeInteger(port) && port > 10_000);
  const config = baseConfig(undefined);
  await runEffectstream({
    appName: "canonical-real-postgres",
    appVersion: "1.0.0",
    config: config as any,
    stateMachine: stateMachine as any,
    apiRouter,
    database: {
      type: "postgres",
      host: process.env.EFFECTSTREAM_TEST_PG_HOST ?? "127.0.0.1",
      port,
      user: "runner",
      database: "runner",
      password: "runner-password",
    },
    processSignals: false,
  });
  assert.deepEqual(events, ["init", "start", "pool-close"]);
  assertRestored();
} else {
  assert.fail(`Unknown canonical runner scenario: ${scenario}`);
}

console.log("ok");
