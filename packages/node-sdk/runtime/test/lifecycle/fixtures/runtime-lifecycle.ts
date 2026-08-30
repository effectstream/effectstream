/**
 * Subprocess fixture driving the real `start()` from `src/main.ts` (spec 00031:
 * G2, G3, G5, G8, G10b).
 *
 * A scenario is one process: the runtime boots against an in-process PGLite
 * gateway on an OS-selected port above 10000, the scenario's failure is
 * injected, the runtime is torn down, and the observable outcome is printed as
 * stdout markers for the parent test to assert on.
 *
 * Booting `start()` in the shared `bun test` process is not an option — the
 * existing reproduction harness documents that a second in-process boot stalls
 * the sync loops — so every scenario gets its own process, exactly like
 * `test/reproduction/node-runner.ts`.
 *
 * Usage: `bun runtime-lifecycle.ts '<json Spec>'`
 */
import type { Server } from "node:net";
import pg from "pg";
import { run, type Task } from "effection";
import { EventBroker } from "@effectstream/event-server";
import { startPglite, type PgliteHandle } from "@effectstream/db/start-pglite";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import { init, start } from "../../../src/main.ts";
import type { StartConfigGameStateTransitions } from "../../../src/types.ts";
import {
  buildConfig,
  TEST_PRIMITIVE_TYPE,
  TestEventPrimitive,
} from "../../reproduction/scenario.ts";
import { listenTcp, sleep, tcpConnects, waitUntil } from "../support.ts";

export type Spec = {
  mode:
    | "broker-cancel-during-start"
    | "broker-shutdown-error"
    | "child-failure-with-pool-end-error";
  apiPort: number;
  pglitePort: number;
  brokerTcpPort: number;
  brokerWsPort: number;
};

const spec: Spec = JSON.parse(process.argv[2] ?? "{}");
const noopStf: StartConfigGameStateTransitions = function* () {};

/** Flatten an error tree into a stable, greppable one-line shape. */
function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return `Aggregate[${error.errors.map(describeError).join(" | ")}]`;
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ? `${code}:${error.message}` : error.message;
  }
  return String(error);
}

/**
 * Report whether a port is released within `ms`. Polling rather than sampling
 * once keeps a busy machine's slow-but-correct release from being read as a
 * leak; a genuine leak stays bound for the whole window.
 */
async function portState(
  port: number,
  ms = 5_000,
): Promise<"bound" | "free"> {
  const end = Date.now() + ms;
  for (;;) {
    if (!(await tcpConnects(port))) return "free";
    if (Date.now() >= end) return "bound";
    await sleep(50);
  }
}

function say(marker: string, value: string): void {
  console.log(`${marker}:${value}`);
}

async function main(): Promise<void> {
  // The engine reads every one of these lazily through ENV getters, so setting
  // them here (before the runtime is constructed) is enough.
  process.env.PGLITE = "true";
  process.env.PGLITE_DATA_DIR = "memory://";
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = String(spec.pglitePort);
  process.env.DB_NAME = "postgres";
  process.env.DB_USER = "postgres";
  process.env.DB_PW = "";
  process.env.EFFECTSTREAM_API_PORT = String(spec.apiPort);
  process.env.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS = "false";
  process.env.MQTT_ENGINE_BROKER_PORT = String(spec.brokerTcpPort);
  process.env.MQTT_ENGINE_BROKER_WS_PORT = String(spec.brokerWsPort);
  const usesBroker = spec.mode !== "child-failure-with-pool-end-error";
  process.env.MQTT_BROKER = usesBroker ? "true" : "false";
  // Telemetry is exercised by its own fixture; here it would only add an
  // unreachable-collector flush to every teardown.
  process.env.OTEL_SDK_DISABLED = "true";

  let brokerStartGateInstalled = false;
  if (spec.mode === "broker-cancel-during-start") {
    // Let the broker really bind, then hang so the runtime is cancelled while
    // `start()` is still awaiting it.
    const never = new Promise<void>(() => {});
    const realStart = EventBroker.prototype.start;
    EventBroker.prototype.start = function (this: EventBroker): Promise<void> {
      return realStart.call(this).then(() => never);
    };
    brokerStartGateInstalled = true;
  }

  if (spec.mode === "broker-shutdown-error") {
    const realShutdown = (EventBroker.prototype as unknown as {
      shutdown: () => Promise<void>;
    }).shutdown;
    (EventBroker.prototype as unknown as { shutdown: () => Promise<void> })
      .shutdown = function (this: EventBroker): Promise<void> {
        // Release the real resources first, then fail: a broker that frees its
        // ports but reports a cleanup error must not be reported as clean.
        return realShutdown.call(this).then(() => {
          throw new Error("broker-shutdown-boom");
        });
      };
  }

  let apiBlocker: Server | undefined;
  if (spec.mode === "child-failure-with-pool-end-error") {
    // Wildcard bind: the runtime listens on 0.0.0.0, and on BSD a loopback-only
    // holder would not conflict with it.
    apiBlocker = await listenTcp(spec.apiPort, "0.0.0.0");
    const realEnd = pg.Pool.prototype.end;
    void realEnd;
    pg.Pool.prototype.end = function (this: pg.Pool): Promise<void> {
      return Promise.reject(new Error("pool-end-boom"));
    };
  }

  const database: PgliteHandle = await startPglite(spec.pglitePort);
  await database.db.waitReady;
  say("PGLITE_READY", String(database.port));

  const cfg = buildConfig({
    securityNamespace: "runtime-lifecycle",
    events: [],
  });
  const syncInfo = toSyncProtocolWithNetwork(cfg);
  // Explicit, tiny tips. Without them the synthetic TEST chain falls back to a
  // wall-clock tip and the node tries to sync decades of blocks.
  for (const entry of syncInfo) {
    TestChainControl.setTip(entry.syncProtocol.name, 3);
  }

  let started = false;
  const task: Task<unknown> = run(function* () {
    yield* init();
    yield* withEffectstreamStaticConfig(cfg, function* () {
      yield* start({
        appName: "runtime-lifecycle",
        appVersion: "1.0.0",
        syncInfo,
        gameStateTransitions: noopStf,
        userDefinedPrimitives: { [TEST_PRIMITIVE_TYPE]: TestEventPrimitive },
        events: false,
        dev: {
          resetPublicData: false,
          onStarted: () => {
            started = true;
          },
        },
      });
    });
  });
  const settled = Promise.resolve(task).then(
    () => "ok",
    (error: unknown) => `err:${describeError(error)}`,
  );

  try {
    if (spec.mode === "child-failure-with-pool-end-error") {
      // The HTTP child fails at listen; the runtime tears itself down.
      say("TASK_SETTLED", await settled);
    } else {
      await waitUntil(() => started, 60_000, "runtime startup");
      // Both listeners: the broker binds TCP first, so waiting only on TCP
      // would race the WebSocket half of its startup.
      await waitUntil(
        () => tcpConnects(spec.brokerTcpPort),
        60_000,
        "broker TCP listener",
      );
      await waitUntil(
        () => tcpConnects(spec.brokerWsPort),
        60_000,
        "broker WebSocket listener",
      );
      say("BROKER_TCP_BOUND", "yes");
      if (spec.mode === "broker-shutdown-error") {
        // This scenario is about a *failing* shutdown, not about cancelling a
        // start. Wait until the runtime is demonstrably past the broker block
        // — the HTTP server is spawned after it — so the broker's own cleanup
        // registration is not itself the thing under test.
        await waitUntil(
          () => tcpConnects(spec.apiPort),
          60_000,
          "API listener (runtime past the broker block)",
        );
      }
      const halted = await task.halt().then(
        () => "ok",
        (error: unknown) => `err:${describeError(error)}`,
      );
      // Give the OS a moment to release listeners before sampling them.
      await sleep(100);
      say("AFTER_HALT_BROKER_TCP", await portState(spec.brokerTcpPort));
      say("AFTER_HALT_BROKER_WS", await portState(spec.brokerWsPort));
      say("AFTER_HALT_API", await portState(spec.apiPort));
      say("HALT_SETTLED", halted);
    }
  } finally {
    if (brokerStartGateInstalled) {
      // Nothing else runs after this, but keep the process from holding a
      // half-started broker if the scenario bailed out early.
    }
    await database.close({ force: true }).catch(() => {});
    if (apiBlocker) {
      await new Promise<void>((resolve) => apiBlocker!.close(() => resolve()));
    }
  }

  say("FIXTURE_DONE", spec.mode);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      `FIXTURE_FAILED:${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`,
    );
    process.exit(1);
  },
);
