/**
 * Deterministic, in-process harness for reproducing sync-service issues.
 *
 * - Runs a real PGLite server in-process (state survives a simulated restart
 *   because the server stays alive while the node task is halted/restarted).
 * - Boots the real runtime (`start()`) over a synthetic `test` chain whose tip
 *   is controlled via {@link TestChainControl}, so scenarios are deterministic
 *   (fixed tips → a well-defined "stable" state we can poll for).
 *
 * Lives in the runtime package because it imports `start()` (the sync package
 * must not depend on runtime). See ./buffering.test.ts and ./resume.test.ts,
 * and RESULTS.md for measurements.
 */
import pg from "pg";
import { type PgliteHandle, startPglite } from "@effectstream/db/start-pglite";
import { run, type Task } from "effection";
import {
  ConfigBuilder,
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { init, start } from "../../src/main.ts";
import type { StartConfigGameStateTransitions } from "../../src/types.ts";
import { type AllSyncProtocols, TestChainControl } from "@effectstream/sync";
import { Primitive } from "@effectstream/sm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── A minimal user-defined primitive ─────────────────────────────────────────
// Writes one row to effectstream.primitive_accounting per event (no STF needed:
// stateMachinePayload is null). Tests assert on that table.
export const TEST_PRIMITIVE_TYPE = "TEST:EVENT";

export class TestEventPrimitive extends Primitive<any, any> {
  readonly internalTypeName = TEST_PRIMITIVE_TYPE as any;
  override grammar = [] as any;
  constructor(config: any) {
    super(config);
  }
  // deno-lint-ignore require-yield
  override *getPayload(_height: any, primitiveTransactionData: any): any {
    const payload = primitiveTransactionData.output.payload;
    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: { type: "none", address: "0x0" },
          accountingPayload: payload,
          stateMachinePayload: null,
        },
      ],
    };
  }
  override getConfig(): any {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
    };
  }
}

const noopStf: StartConfigGameStateTransitions = function* () {};

// ── Env / DB lifecycle ───────────────────────────────────────────────────────

let portCounter = 5544;

export type Harness = {
  pglite: PgliteHandle;
  pool: pg.Pool;
  dataDir: string;
  runNode: (opts: RunNodeOpts) => Promise<RunningNode>;
  /**
   * Simulate a full process restart: close the PGLite server (severing the
   * stopped node's lingering pool, which otherwise holds PGLite's single
   * connection) and reopen it on the SAME data dir (state persists on disk).
   */
  simulateRestart: () => Promise<void>;
  teardown: () => Promise<void>;
};

export type RunNodeOpts = {
  config: ReturnType<ConfigBuilder["build"]> | any;
  /** Unique per boot so the (test-only) HTTP server never collides. */
  apiPort: number;
};

export type RunningNode = {
  task: Task<unknown>;
  /** Live sync protocols (captured via the dev.onStarted hook). */
  syncProtocols: () => AllSyncProtocols[];
  /** Boot error, if start() threw. */
  bootError: () => unknown;
  stop: () => Promise<void>;
};

/**
 * Start a PGLite server + connect a query pool. Sets the lazily-read ENV the
 * runtime uses (DB_*, PGLITE). Keep one Harness per test; reuse across the
 * simulated restart so the page queue persists.
 */
export async function setupHarness(): Promise<Harness> {
  const dbPort = portCounter++;
  const dataDir = mkdtempSync(join(tmpdir(), "sync-repro-"));

  process.env.PGLITE = "true";
  process.env.PGLITE_DATA_DIR = dataDir;
  process.env.DB_HOST = "localhost";
  process.env.DB_PORT = String(dbPort);
  process.env.DB_NAME = "postgres";
  process.env.DB_USER = "postgres";
  // No MQTT broker in tests: it binds fixed ports (8883/9883) that aren't freed
  // by halt(), so it would collide on restart. Event publishes are
  // fire-and-forget and swallowed when no broker is present.
  process.env.MQTT_BROKER = "false";

  const makePool = (port: number) =>
    new pg.Pool({
      host: "localhost",
      port,
      user: "postgres",
      database: "postgres",
      max: 1,
    });

  let pglite = await startPglite(dbPort);
  let pool = makePool(dbPort);

  const runNode = async (opts: RunNodeOpts): Promise<RunningNode> => {
    // Re-assert THIS harness's DB env before booting. Tests may create multiple
    // harnesses (each calls setupHarness, which mutates the shared process.env);
    // without this the node would connect to whichever harness ran setup last.
    process.env.PGLITE = "true";
    process.env.PGLITE_DATA_DIR = dataDir;
    process.env.DB_HOST = "localhost";
    process.env.DB_PORT = String(dbPort);
    process.env.DB_NAME = "postgres";
    process.env.DB_USER = "postgres";
    process.env.MQTT_BROKER = "false";
    process.env.EFFECTSTREAM_API_PORT = String(opts.apiPort);
    // The PrimitiveRegistry is a process-global singleton. A real restart gets
    // a fresh process; here we clear it in place so primitives re-register
    // cleanly (otherwise "Primitive ... already exists").
    const reg = (globalThis as { EFFECTSTREAM_REGISTRY?: Record<string, unknown> })
      .EFFECTSTREAM_REGISTRY;
    if (reg) for (const k of Object.keys(reg)) delete reg[k];
    let captured: AllSyncProtocols[] = [];
    let bootErr: unknown = undefined;
    const cfg = opts.config;
    const task = run(function* () {
      yield* init();
      yield* withEffectstreamStaticConfig(cfg, function* () {
        yield* start({
          appName: "sync-repro",
          appVersion: "1.0.0",
          syncInfo: toSyncProtocolWithNetwork(cfg),
          gameStateTransitions: noopStf,
          userDefinedPrimitives: { [TEST_PRIMITIVE_TYPE]: TestEventPrimitive },
          dev: {
            resetPublicData: false,
            onStarted: ({ syncProtocols }) => {
              captured = syncProtocols;
            },
          },
        });
      });
    });
    // start() runs forever; surface boot failures instead of an unhandled
    // reject. `halted` is the expected rejection from stop()/task.halt().
    Promise.resolve(task).catch((e) => {
      if (String(e).includes("halted")) return;
      bootErr = e;
    });
    return {
      task,
      syncProtocols: () => captured,
      bootError: () => bootErr,
      stop: async () => {
        await task.halt();
      },
    };
  };

  const harness: Harness = {
    pglite,
    pool,
    dataDir,
    runNode,
    simulateRestart: async () => {
      // Keep the PGLite server alive (closing/reopening it is WASM-fragile and
      // loses state). State persists in the live instance; the node task is
      // halted/rebooted by the test. The stopped node's pool lingers but the
      // gateway multiplexes sockets over the one PGLite db.
    },
    teardown: async () => {
      TestChainControl.clear();
      await pool.end().catch(() => {});
      await pglite.close().catch(() => {});
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return harness;
}

// ── Polling helpers ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Latest finalized effectstream block height (incl. empty blocks). */
export async function latestFinalizedHeight(pool: pg.Pool): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT MAX(block_height)::int AS h FROM effectstream.effectstream_blocks
       WHERE effectstream_block_hash IS NOT NULL`,
    );
    return res.rows[0]?.h ?? 0;
  } catch (e) {
    // The system migrations may not have created the table yet during boot.
    if ((e as { code?: string })?.code === "42P01") return 0;
    throw e;
  }
}

/** Wait until finalized height reaches `target` (or timeout). */
export async function waitForHeight(
  node: RunningNode,
  pool: pg.Pool,
  target: number,
  timeoutMs = 30_000,
): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const err = node.bootError();
    if (err) throw new Error(`node boot failed: ${String(err)}`);
    const h = await latestFinalizedHeight(pool);
    if (h >= target) return h;
    await sleep(50);
  }
  throw new Error(
    `waitForHeight(${target}) timed out at ${await latestFinalizedHeight(pool)}`,
  );
}

/**
 * Wait until the finalized height stops advancing for `quietMs` (the system
 * has reached its deterministic stable state given fixed tips).
 */
export async function waitUntilStable(
  node: RunningNode,
  pool: pg.Pool,
  { quietMs = 800, timeoutMs = 30_000 } = {},
): Promise<number> {
  const startedAt = Date.now();
  let last = -1;
  let lastChange = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const err = node.bootError();
    if (err) throw new Error(`node boot failed: ${String(err)}`);
    const h = await latestFinalizedHeight(pool);
    if (h !== last) {
      last = h;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= quietMs) {
      return h;
    }
    await sleep(50);
  }
  return last;
}

/** Count primitive_accounting rows whose payload carries the given marker. */
export async function countEventRows(
  pool: pg.Pool,
  marker: string,
): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS c FROM effectstream.primitive_accounting
     WHERE payload->>'marker' = $1`,
    [marker],
  );
  return res.rows[0]?.c ?? 0;
}

/** Page-queue rows for a protocol (the durable per-chunk queue). */
export async function pageRows(
  pool: pg.Pool,
  protocolName: string,
): Promise<{ page_number: number }[]> {
  const res = await pool.query(
    `SELECT page_number FROM effectstream.sync_protocol_pagination
     WHERE protocol_name = $1 ORDER BY page_number ASC`,
    [protocolName],
  );
  return res.rows;
}

/** Hex of the most-recent non-empty (non-"0x0") effectstream block hash. */
export async function lastNonEmptyBlockHash(
  pool: pg.Pool,
): Promise<string | null> {
  try {
    const res = await pool.query(
      `SELECT encode(effectstream_block_hash, 'hex') AS h
       FROM effectstream.effectstream_blocks
       WHERE effectstream_block_hash IS NOT NULL
         AND effectstream_block_hash != '\\x307830'::bytea
       ORDER BY block_height DESC LIMIT 1`,
    );
    return res.rows[0]?.h ?? null;
  } catch {
    return null;
  }
}

/** Sample a protocol's in-memory buffered-data size now. */
export function bufferSize(
  node: RunningNode,
  protocolName: string,
): number {
  const sp = node.syncProtocols().find((p) => p.name === protocolName);
  return sp ? sp.bufferedData.size() : 0;
}

export { sleep };
