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
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PgliteHandle, startPglite } from "@effectstream/db/start-pglite";
import type { EventSpec } from "./scenario.ts";

// Re-export the bits the test files assert with, so they import from one place.
export { TEST_PRIMITIVE_TYPE } from "./scenario.ts";
export type { EventSpec } from "./scenario.ts";
export {
  countEventRows,
  latestFinalizedHeight,
  maxPage,
  pageRows,
} from "./poll.ts";

// ── Throwaway PostgreSQL cluster (one per test process) ──────────────────────

type Cluster = { port: number; dataDir: string };

let clusterPromise: Promise<Cluster> | undefined;
let clusterBin: string | undefined;
let dbCounter = 0;
let activeHarnessCount = 0;
let clusterStopped = false;

/** Resolve the postgresql@18 bin dir (Homebrew default, or REPRO_PG_BINDIR). */
function pgBinDir(): string {
  const override = process.env.REPRO_PG_BINDIR;
  if (override) return override;
  try {
    const prefix = execFileSync("brew", ["--prefix", "postgresql@18"], {
      encoding: "utf8",
    }).trim();
    return join(prefix, "bin");
  } catch {
    throw new Error(
      "postgresql@18 not found. Install it (`brew install postgresql@18`) " +
        "or set REPRO_PG_BINDIR to a Postgres bin dir that bundles pg_ivm.",
    );
  }
}

/** True if the Postgres backend can boot (postgresql@18 resolvable). */
export function postgresAvailable(): boolean {
  try {
    pgBinDir();
    return true;
  } catch {
    return false;
  }
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
  if (clusterPromise) return clusterPromise;
  clusterPromise = (async () => {
    const bin = pgBinDir();
    clusterBin = bin;
    const env = { ...process.env, LC_ALL: "C" };

    cleanupOrphanedClusters(bin, env);

    const dataDir = mkdtempSync(join(tmpdir(), "repro-pg-"));
    const port = await freePort();

    writeFileSync(join(dataDir, "repro-owner.pid"), String(process.pid));

    execFileSync(join(bin, "initdb"), [
      "-D", dataDir,
      "-U", "postgres",
      "--auth=trust",
      "--locale=C",
      "--encoding=UTF8",
      "--no-instructions",
    ], { env, stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), `\nport = ${port}\n`);
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

  // Parent assertions go through poll.ts's `q`; PGLITE=false → plain queries.
  process.env.PGLITE = "false";

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

  return { pool, runToHeight: makeRunToHeight(dbEnv), teardown };
}

/**
 * PGLite backend — in-memory WASM Postgres behind a `startPglite` gateway. The
 * single WASM backend tolerates no overlapping queries, so the subprocess routes
 * its polls through the global DB mutex (node-runner.ts / poll.ts) and both
 * pools cap at one connection. `startPglite` reads its config from ENV.
 */
async function setupPgliteHarness(): Promise<Harness> {
  const port = await freePort();
  const dbName = "postgres";

  // startPglite reads these from ENV at construction; a fresh `memory://`
  // instance is isolated per harness. PGLITE=true mutex-guards parent asserts.
  process.env.PGLITE_DATA_DIR = "memory://";
  process.env.DB_USER = "postgres";
  process.env.DB_NAME = dbName;
  process.env.PGLITE = "true";

  const handle: PgliteHandle = await startPglite(port);
  handle.server.unref(); // don't let a leaked gateway keep the process alive

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
    await handle.close().catch(() => {});
  };

  return { pool, runToHeight: makeRunToHeight(dbEnv), teardown };
}
