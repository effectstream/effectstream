/**
 * Deterministic harness for reproducing sync-service issues. Two backends behind
 * one {@link setupHarness} API:
 *
 * - **PGLite** (default) — in-memory WASM Postgres behind a `startPglite`
 *   gateway, the production PGLite wire path (`PGLITE=true`). Dependency-free.
 * - **Postgres** (opt-in via `PGLITE=false`) — a throwaway Homebrew
 *   `postgresql@18` cluster per test process (it bundles `pg_ivm`), each
 *   {@link setupHarness} getting a fresh database. Higher fidelity; needs
 *   `postgresql@18` on PATH (override the bin dir with `REPRO_PG_BINDIR`, probe
 *   with {@link postgresAvailable}).
 *
 * Each node runs in its own subprocess ({@link ./node-runner.ts}) booting the
 * real runtime over a synthetic `test` chain, so a "restart" is a genuine new OS
 * process: the in-memory Deque is gone while the database keeps every committed
 * row. (Booting `start()` twice in one process stalls the sync loops under
 * `bun test`, so we never do it.)
 *
 * Lives in the runtime package because the subprocess imports `start()`.
 */
import net from "node:net";
import pg from "pg";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventSpec } from "./scenario.ts";
import { TestChainControl } from "@effectstream/sync";
import { toSyncProtocolWithNetwork } from "@effectstream/config";

export type RunNodeOpts = {
  config: any;
  apiPort: number;
  /** Enable/disable empty-block coalescing for this long-lived node. */
  coalesce?: boolean;
};

export type RunningNode = {
  child: any;
  apiPort: number;
  bufferSizes: Record<string, number>;
  pauses: Record<string, number>;
  ownBlocks: Record<string, number | null>;
  /** finalizedBlockStream backlog (produced − consumed); 0 until first scrape. */
  inFlight: number;
  /** Empty blocks folded away by the coalescer so far. */
  coalescedBlocks: number;
  stop: () => Promise<void>;
  syncProtocols: () => any[];
};

// Re-export the bits the test files assert with, so they import from one place.
// `sleep` is imported (not just re-exported) so the helpers below can use it too.
export { TEST_PRIMITIVE_TYPE } from "./scenario.ts";
export type { EventSpec } from "./scenario.ts";
import {
  countEventRows,
  latestFinalizedHeight,
  maxPage,
  pageRows,
  sleep,
} from "./poll.ts";
export { countEventRows, latestFinalizedHeight, maxPage, pageRows, sleep };

// ── Throwaway PostgreSQL cluster (one per test process) ──────────────────────

type Cluster = { port: number; dataDir: string };

let clusterPromise: Promise<Cluster> | undefined;
let clusterBin: string | undefined;
let dbCounter = 0;
let activeHarnessCount = 0;
let clusterStopped = false;

/** Resolve a Postgres bin dir. Tries, in order: env var, Homebrew, pg_config, PATH, Linux conventions. */
function resolvePgBinDir(): string | undefined {
  const override = process.env.REPRO_PG_BINDIR;
  if (override) return override;

  // macOS + Homebrew
  if (platform() === "darwin") {
    try {
      const prefix = execFileSync("brew", ["--prefix", "postgresql@18"], {
        encoding: "utf8",
      }).trim();
      return join(prefix, "bin");
    } catch { /* not installed via Homebrew */ }
  }

  // pg_config — standard on most systems with PostgreSQL dev packages
  try {
    const dir = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
    if (dir) return dir;
  } catch { /* not available */ }

  // PATH probe — initdb directly accessible
  try {
    const which = platform() === "win32" ? "where" : "which";
    const p = execFileSync(which, ["initdb"], { encoding: "utf8" }).trim();
    if (p) return resolve(p, "..");
  } catch { /* not on PATH */ }

  // Linux convention (Debian/Ubuntu layout)
  if (platform() === "linux") {
    for (const ver of [18, 17, 16]) {
      const dir = `/usr/lib/postgresql/${ver}/bin`;
      try {
        readdirSync(dir);
        return dir;
      } catch { /* not installed */ }
    }
  }

  return undefined;
}

/** True if a Postgres binary is available on this system. */
export function postgresAvailable(): boolean {
  return resolvePgBinDir() !== undefined;
}

/** Grab a free TCP port by binding to :0 and reading the assigned port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

/** The standalone PGLite gateway script (`--port` mode). */
const PGLITE_GATEWAY = fileURLToPath(import.meta.resolve("@effectstream/db/start-pglite"));

/** Resolve once a child process has exited (immediately if it already has). */
function waitChildExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode != null || child.signalCode != null) return resolve();
    child.once("exit", () => resolve());
  });
}

/**
 * Poll `fn` every `intervalMs` until it resolves truthy or `timeoutMs` elapses.
 * A throwing/false `fn` counts as "not ready yet". Returns whether it succeeded.
 */
async function pollUntil(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {
      // not ready yet
    }
    await sleep(intervalMs);
  }
  return false;
}

/** True once a TCP connection to `port` succeeds; never rejects. */
function tcpConnects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

/** Wait until something accepts a connection on `port` (the gateway is up). */
async function waitPortOpen(port: number, timeoutMs = 15_000): Promise<void> {
  if (!(await pollUntil(() => tcpConnects(port), timeoutMs))) {
    throw new Error(`PGLite gateway never came up on port ${port}`);
  }
}

/**
 * Kill orphaned `repro-pg-*` clusters left behind by test processes that
 * exited without hitting their `exit` handler (SIGKILL, IDE stop, etc.).
 *
 * PostgreSQL writes the postmaster PID into `<dataDir>/postmaster.pid`.  We
 * also write our own owner PID into `<dataDir>/repro-owner.pid` so we can
 * distinguish our clusters from unrelated `repro-pg-*` dirs.  A directory is
 * considered orphaned when the owner process is dead; we then `pg_ctl stop`
 * and `rm -rf` it.
 */
function cleanupOrphanedClusters(bin: string, env: Record<string, string | undefined>): void {
  const tmp = tmpdir();
  let entries: string[];
  try { entries = readdirSync(tmp); } catch { return; }

  for (const name of entries) {
    if (!name.startsWith("repro-pg-")) continue;
    const dataDir = join(tmp, name);

    const ownerFile = join(dataDir, "repro-owner.pid");
    let ownerPid: number | undefined;
    try { ownerPid = parseInt(readFileSync(ownerFile, "utf8").trim(), 10); } catch { /* no owner file */ }

    if (ownerPid == null || Number.isNaN(ownerPid)) continue;

    try { process.kill(ownerPid, 0); } catch {
      // Owner is dead — orphaned cluster.
      spawnSync(join(bin, "pg_ctl"), ["-D", dataDir, "stop", "-m", "immediate"], {
        env, stdio: "ignore",
      });
      rmSync(dataDir, { recursive: true, force: true });
    }
  }
}

/**
 * Boot a fresh cluster the first time it's needed and reuse it for the rest of
 * the process. initdb with C locale + trust auth (mirrors e2e_postgres.sh; the
 * C locale dodges the macOS "postmaster became multithreaded during startup"
 * fatal). Stopped synchronously on process exit.
 *
 * Before booting, any orphaned clusters from prior crashed runs are cleaned up
 * so they don't accumulate and exhaust system resources.
 */
function ensureCluster(): Promise<Cluster> {
  // If the cluster was stopped (last harness tore down), start a fresh one.
  if (clusterPromise && !clusterStopped) return clusterPromise;
  clusterPromise = undefined;
  clusterPromise = (async () => {
    const bin = resolvePgBinDir()!;
    clusterBin = bin;
    const env = { ...process.env, LC_ALL: "C" };

    cleanupOrphanedClusters(bin, env);

    const dataDir = mkdtempSync(join(tmpdir(), "repro-pg-"));
    const port = await freePort();

    execFileSync(join(bin, "initdb"), [
      "-D", dataDir,
      "-U", "postgres",
      "--auth=trust",
      "--locale=C",
      "--encoding=UTF8",
      "--no-instructions",
    ], { env, stdio: "ignore" });

    // Write our owner marker AFTER initdb — it refuses a non-empty data dir, so
    // this must not exist beforehand. Read later by cleanupOrphanedClusters.
    writeFileSync(join(dataDir, "repro-owner.pid"), String(process.pid));
    // Pin the socket dir to our own data dir: Debian/Ubuntu packages default
    // unix_socket_directories to /var/run/postgresql, which is owned by the
    // postgres user, so a cluster booted by anyone else dies at startup with
    // "could not create lock file ...: Permission denied".
    appendFileSync(
      join(dataDir, "postgresql.conf"),
      `\nport = ${port}\nunix_socket_directories = '${dataDir}'\n`,
    );
    execFileSync(join(bin, "pg_ctl"), [
      "-D", dataDir,
      "-l", join(dataDir, "server.log"),
      "-w",
      "start",
    ], { env, stdio: "ignore" });

    clusterStopped = false;

    const stop = () => {
      spawnSync(join(bin, "pg_ctl"), ["-D", dataDir, "stop", "-m", "immediate"], {
        env,
        stdio: "ignore",
      });
      rmSync(dataDir, { recursive: true, force: true });
      clusterStopped = true;
    };
    process.once("exit", stop);
    return { port, dataDir };
  })();
  return clusterPromise;
}

/** Stop the shared cluster if it's running (called when last harness tears down). */
async function stopCluster(): Promise<void> {
  if (!clusterPromise || clusterStopped) return;
  const cluster = await clusterPromise;
  if (clusterStopped || !clusterBin) return;
  const env = { ...process.env, LC_ALL: "C" };
  spawnSync(join(clusterBin, "pg_ctl"), ["-D", cluster.dataDir, "stop", "-m", "immediate"], {
    env,
    stdio: "ignore",
  });
  rmSync(cluster.dataDir, { recursive: true, force: true });
  clusterStopped = true;
}

// ── Harness ──────────────────────────────────────────────────────────────────

export type Harness = {
  /** Query pool against this harness's database (for assertions). */
  pool: pg.Pool;
  /**
   * Boot one node in a subprocess, sync it to `target` height (+ optional page
   * watermarks), then let it exit. Resolves once the child exits cleanly; the
   * database keeps everything it committed. Rejects if the child fails.
   */
  runToHeight: (opts: RunToHeightOpts) => Promise<void>;
  runNode: (opts: RunNodeOpts) => Promise<RunningNode>;
  teardown: () => Promise<void>;
};

export type RunToHeightOpts = {
  events: EventSpec[];
  parallelStepSize?: number;
  /** Manual chain tips, e.g. { mainClock: 100, parallelP: 200 }. */
  tips: Record<string, number>;
  /** Finalized height the node must reach before exiting. */
  target: number;
  /** Unique per boot so the (test-only) HTTP server never collides. */
  apiPort: number;
  /** Optional per-protocol page watermarks to also wait for before exiting. */
  waitPages?: Record<string, number>;
  securityNamespace?: string;
  /** Enable/disable empty-block coalescing. */
  coalesce?: boolean;
  /**
   * Exit as soon as `startup()` has completed (the `dev.onStarted` callback),
   * without waiting for any finalized height. Used by tests whose subject is
   * startup itself — config reconciliation, snapshot persistence, primitive
   * construction — rather than block production. `target`/`tips` are then
   * irrelevant, but a genuine subprocess still boots the real runtime against
   * the real database, so a "restart" is still a real restart.
   */
  bootOnly?: boolean;
  /**
   * Full ConfigBuilder output, for tests that need protocols the default
   * scenario doesn't provide. When omitted the node-runner builds the standard
   * two-protocol scenario from `events`/`parallelStepSize`.
   *
   * NOTE: `tips` must then be keyed by THIS config's protocol names — a
   * mismatch leaves the synthetic chain on its wall-clock fallback tip, which
   * silently syncs to "now" instead of the intended height.
   */
  config?: any;
};

const RUNNER = join(import.meta.dir, "node-runner.ts");

export type Backend = "pglite" | "postgres";

/** Backend keyed off the engine's `PGLITE` flag: `PGLITE=false` → real Postgres. */
function defaultBackend(): Backend {
  return process.env.PGLITE === "false" ? "postgres" : "pglite";
}

/** `runToHeight` closure shared by both backends; only needs the child's dbEnv. */
function makeRunToHeight(
  dbEnv: Record<string, string>,
): (opts: RunToHeightOpts) => Promise<void> {
  return (opts: RunToHeightOpts): Promise<void> => {
    const spec = {
      securityNamespace: opts.securityNamespace ?? "sync-repro",
      events: opts.events,
      parallelStepSize: opts.parallelStepSize,
      tips: opts.tips,
      target: opts.target,
      apiPort: opts.apiPort,
      waitPages: opts.waitPages,
      coalesce: opts.coalesce,
      bootOnly: opts.bootOnly,
      // Forwarded so a caller can supply its own protocols; node-runner already
      // prefers `spec.config` over the default scenario.
      config: opts.config,
    };
    return new Promise<void>((resolve, reject) => {
      const child = spawn("bun", [RUNNER, JSON.stringify(spec)], {
        env: { ...process.env, ...dbEnv },
        stdio: process.env.REPRO_DEBUG
          ? ["ignore", "inherit", "inherit"]
          : ["ignore", "ignore", "pipe"],
      });
      // Keep only a tail of stderr so the MQTT-publish flood doesn't pile up;
      // surface it only if the child fails.
      const tail: string[] = [];
      child.stderr?.on("data", (b: Buffer) => {
        for (const line of b.toString().split("\n")) {
          if (line && !line.includes("publish")) tail.push(line);
        }
        if (tail.length > 40) tail.splice(0, tail.length - 40);
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `node subprocess exited ${code}\n${tail.join("\n")}`,
            ),
          );
        }
      });
    });
  };
}

/** `runNode` closure shared by both backends; spawns a subprocess and queries metrics. */
function makeRunNode(
  dbEnv: Record<string, string>,
): (opts: RunNodeOpts) => Promise<RunningNode> {
  return async (opts: RunNodeOpts): Promise<RunningNode> => {
    const tips: Record<string, number> = {};
    for (const sp of toSyncProtocolWithNetwork(opts.config)) {
      const tip = TestChainControl.getTip(sp.syncProtocol.name);
      if (tip !== undefined) {
        tips[sp.syncProtocol.name] = tip;
      }
    }

    const spec = {
      securityNamespace: opts.config.securityNamespace ?? "sync-repro",
      events: [],
      tips,
      target: 999999,
      apiPort: opts.apiPort,
      config: opts.config,
      coalesce: opts.coalesce,
    };

    const child = spawn("bun", [RUNNER, JSON.stringify(spec)], {
      env: { ...process.env, ...dbEnv, ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      stdio: process.env.REPRO_DEBUG
        ? ["ignore", "inherit", "inherit"]
        : ["ignore", "ignore", "pipe"],
    });

    let alive = true;

    const node: RunningNode = {
      child,
      apiPort: opts.apiPort,
      bufferSizes: {},
      pauses: {},
      ownBlocks: {},
      inFlight: 0,
      coalescedBlocks: 0,
      syncProtocols() {
        return Object.entries(this.bufferSizes).map(([name, buf]) => ({
          name,
          bufferedData: {
            size: () => buf,
          },
          backpressurePauses: this.pauses[name] ?? 0,
          lastPage: this.ownBlocks[name] != null ? { ownBlockNumber: this.ownBlocks[name] } : null,
        }));
      },
      stop: async () => {
        alive = false;
        await poll.catch(() => {});
        child.kill("SIGKILL");
        await waitChildExit(child);
      },
    };

    // Background loop scraping the node's debug metrics until stop() flips `alive`.
    const poll = (async () => {
      while (alive) {
        try {
          const res = await fetch(`http://127.0.0.1:${opts.apiPort}/debug/metrics`);
          if (res.ok) {
            const data = await res.json() as any;
            if (data && Array.isArray(data.protocols)) {
              for (const p of data.protocols) {
                node.bufferSizes[p.name] = p.buf;
                node.pauses[p.name] = p.pauses;
                node.ownBlocks[p.name] = p.ownBlockNumber;
              }
            }
            if (data?.finalizedStream) {
              node.inFlight = data.finalizedStream.inFlight ?? 0;
              node.coalescedBlocks = data.finalizedStream.coalesced ?? 0;
            }
          }
        } catch {
          // ignore
        }
        await sleep(25);
      }
    })();

    // Readiness here means "the HTTP server is listening", not "the node is
    // healthy": /health answers 503 while the node is still `starting` (no
    // block applied yet) or `stalled`, and several tests deliberately boot a
    // node into exactly those states.
    const up = await pollUntil(
      () =>
        fetch(`http://127.0.0.1:${opts.apiPort}/health`)
          .then((r) => r.status === 200 || r.status === 503),
      10_000,
    );
    if (!up) {
      await node.stop();
      throw new Error(`node subprocess failed to boot on port ${opts.apiPort}`);
    }

    return node;
  };
}

/**
 * Fresh harness on the chosen backend (default {@link defaultBackend}, override
 * with `{ backend }`). One Harness per node lineage: its database outlives a
 * restart, so committed state persists exactly as in production.
 */
export async function setupHarness(
  opts: { backend?: Backend } = {},
): Promise<Harness> {
  const backend = opts.backend ?? defaultBackend();
  return backend === "postgres"
    ? setupPostgresHarness()
    : setupPgliteHarness();
}

/** Real Postgres backend — a fresh database on the shared throwaway cluster. */
async function setupPostgresHarness(): Promise<Harness> {
  const cluster = await ensureCluster();
  const dbName = `repro_${process.pid}_${dbCounter++}`;
  activeHarnessCount++;

  // CREATE DATABASE on the maintenance db, then point everything at it.
  const admin = new pg.Pool({
    host: "127.0.0.1",
    port: cluster.port,
    user: "postgres",
    database: "postgres",
    max: 1,
  });
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const dbEnv = {
    PGLITE: "false",
    ALLOW_NO_PG_IVM: "true",
    DB_HOST: "127.0.0.1",
    DB_PORT: String(cluster.port),
    DB_NAME: dbName,
    DB_USER: "postgres",
    DB_PW: "",
    MQTT_BROKER: "false",
  };

  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: cluster.port,
    user: "postgres",
    database: dbName,
    max: 10,
  });

  const teardown = async (): Promise<void> => {
    await pool.end().catch(() => {});
    const admin = new pg.Pool({
      host: "127.0.0.1",
      port: cluster.port,
      user: "postgres",
      database: "postgres",
      max: 1,
    });
    try {
      // Drop lingering backends so DROP DATABASE isn't blocked by open conns.
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    } catch {
      // Best-effort: the cluster is torn down wholesale below.
    } finally {
      await admin.end().catch(() => {});
    }

    activeHarnessCount--;
    if (activeHarnessCount <= 0) {
      await stopCluster();
    }
  };

  return { pool, runToHeight: makeRunToHeight(dbEnv), runNode: makeRunNode(dbEnv), teardown };
}

/**
 * PGLite backend — in-memory WASM Postgres behind a `startPglite` gateway.
 *
 * The gateway runs in its OWN subprocess rather than in this test process.
 * PGLite is an Emscripten WASM build that loads the `pg_ivm` extension via
 * dlopen into a shared function table; two instances alive in one process
 * collide ("call_indirect signature mismatch"). bun runs every test file — and
 * every harness within a file (e.g. buffering's 1a + 1b) — in one process, so an
 * in-process gateway means multiple instances coexisting. One gateway = one
 * subprocess = exactly one PGLite instance per process, which sidesteps it.
 *
 * The single WASM backend still tolerates no overlapping queries, so the node
 * subprocess routes its polls through the global DB mutex (node-runner.ts /
 * poll.ts), both pools cap at one connection, and the gateway serializes all
 * clients (start-pglite.ts). The gateway reads its config from ENV.
 */
async function setupPgliteHarness(): Promise<Harness> {
  const port = await freePort();
  const dbName = "postgres";

  // PGLITE=true makes parent assertions (poll.ts `q`) take the DB mutex. The
  // parent never loads PGLite itself — the gateway subprocess does.
  process.env.PGLITE = "true";

  // A fresh `memory://` instance, isolated per harness, in its own process.
  const gatewayEnv = {
    ...process.env,
    PGLITE: "true",
    PGLITE_DATA_DIR: "memory://",
    DB_USER: "postgres",
    DB_NAME: dbName,
  };
  const gateway = spawn("bun", [PGLITE_GATEWAY, "--port", String(port)], {
    env: gatewayEnv,
    stdio: process.env.REPRO_DEBUG ? "inherit" : ["ignore", "ignore", "ignore"],
  });
  await waitPortOpen(port);

  const dbEnv = {
    PGLITE: "true",
    DB_HOST: "127.0.0.1",
    DB_PORT: String(port),
    DB_NAME: dbName,
    DB_USER: "postgres",
    DB_PW: "",
    PGLITE_DATA_DIR: "memory://",
    MQTT_BROKER: "false",
  };

  // One connection: the gateway is a single WASM backend.
  const pool = new pg.Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    database: dbName,
    max: 1,
  });

  const teardown = async (): Promise<void> => {
    await pool.end().catch(() => {});
    gateway.kill("SIGKILL");
    await waitChildExit(gateway);
  };

  return { pool, runToHeight: makeRunToHeight(dbEnv), runNode: makeRunNode(dbEnv), teardown };
}

/** Sample a protocol's in-memory buffered-data size now. */
export function bufferSize(
  node: RunningNode,
  protocolName: string,
): number {
  return node.bufferSizes[protocolName] ?? 0;
}

