/**
 * One-node subprocess entry point.
 *
 * A real engine restart is a new OS process whose in-memory state (notably the
 * sync Deque) is gone while PostgreSQL keeps every committed row. We model that
 * literally: each node runs here, in its own `bun` process, against a database
 * the parent harness created. Booting the runtime twice *in one process* is not
 * how production works and proved unreliable (a second in-process `start()`
 * stalls the sync loops under `bun test`), so the harness spawns this instead.
 *
 * Invocation (by the harness):
 *   bun node-runner.ts '<json-RunSpec>'
 * with DB_* / PGLITE env already set (by the harness) to point at the target
 * database — a real Postgres server or a PGLite gateway.
 *
 * Exit 0 once the node has synced to the requested height (and, for the resume
 * scenario, the requested page watermarks); exit 1 on boot failure.
 */
import pg from "pg";
import { run, type Task } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { TestChainControl } from "@effectstream/sync";
import { init, start } from "../../src/main.ts";
import type { StartConfigAppStateTransitions } from "../../src/types.ts";
import {
  buildConfig,
  type EventSpec,
  TEST_PRIMITIVE_TYPE,
  TestEventPrimitive,
} from "./scenario.ts";
import { waitForHeight, waitForPage, waitUntilStable } from "./poll.ts";

export type RunSpec = {
  securityNamespace: string;
  events: EventSpec[];
  parallelStepSize?: number;
  /** Manual chain tips, e.g. { mainClock: 100, parallelP: 200 }. */
  tips: Record<string, number>;
  /** Finalized height to reach before exiting. */
  target: number;
  apiPort: number;
  /**
   * Optional per-protocol page watermarks to also wait for before exiting.
   * Used by the resume scenario to guarantee the parallel fetcher has raced
   * ahead and persisted its page row before we kill the process.
   */
  waitPages?: Record<string, number>;
  coalesce?: boolean;
};

const noopStf: StartConfigAppStateTransitions = function* () {};

async function main() {
  const spec: RunSpec = JSON.parse(process.argv[2] ?? "{}");

  // DB_* and PGLITE are set by the harness (real Postgres or a PGLite gateway);
  // do NOT override them here. Only force the bits every run shares: no MQTT
  // broker (it binds fixed ports and isn't freed on halt) and a per-run API port.
  process.env.MQTT_BROKER = "false";
  process.env.EFFECTSTREAM_API_PORT = String(spec.apiPort);
  process.env.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS = spec.coalesce ? "true" : "false";
  const isPglite = process.env.PGLITE === "true";

  for (const [name, tip] of Object.entries(spec.tips)) {
    TestChainControl.setTip(name, tip);
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PW || undefined,
    // PGLite is a single WASM backend: cap polls at one connection (they're also
    // mutex-serialized against the engine — see poll.ts).
    max: isPglite ? 1 : 10,
  });

  const cfg = (spec as any).config ?? buildConfig({
    securityNamespace: spec.securityNamespace,
    events: spec.events,
    parallelStepSize: spec.parallelStepSize,
  });

  let bootErr: unknown;
  let started = false;
  let live: any[] = [];
  const task: Task<unknown> = run(function* () {
    yield* init();
    yield* withEffectstreamStaticConfig(cfg, function* () {
      yield* start({
        appName: "sync-repro",
        appVersion: "1.0.0",
        syncInfo: toSyncProtocolWithNetwork(cfg),
        appStateTransitions: noopStf,
        userDefinedPrimitives: { [TEST_PRIMITIVE_TYPE]: TestEventPrimitive },
        dev: {
          resetPublicData: false,
          onStarted: ({ syncProtocols }: any) => {
            live = syncProtocols;
            started = true;
          },
        },
      });
    });
  });
  // start() runs forever; capture a genuine boot failure (not the expected
  // "halted" rejection from our own task.halt() below).
  Promise.resolve(task).catch((e) => {
    if (!String(e).includes("halted")) bootErr = e;
  });

  const guard = async <T>(p: Promise<T>): Promise<T> => {
    const r = await p;
    if (bootErr) throw new Error(`node boot failed: ${String(bootErr)}`);
    return r;
  };

  // Don't poll until `onStarted` fires: init()'s migrations and startup() run
  // before it and aren't mutex-guarded, so on PGLite a poll could overlap them
  // and corrupt the single WASM backend. Steady-state queries after this are.
  while (!started) {
    if (bootErr) throw new Error(`node boot failed: ${String(bootErr)}`);
    await new Promise((r) => setTimeout(r, 20));
  }

  try {
    await guard(waitForHeight(pool, spec.target));
    await guard(waitUntilStable(pool));
    for (const [name, page] of Object.entries(spec.waitPages ?? {})) {
      await guard(waitForPage(pool, name, page));
    }
  } catch (e) {
    const probe = live.map((p) =>
      `${p.name}: lastPage=${JSON.stringify(p.lastPage)} buf=${p.bufferedData.size()} errs=${p.consecutiveErrors}`
    );
    console.error("PROBE:\n  " + probe.join("\n  "));
    throw e;
  } finally {
    await task.halt().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(String(e instanceof Error ? e.stack ?? e.message : e));
    process.exit(1);
  },
);
