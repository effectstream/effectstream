/**
 * Reproductions for the HTTP-server half of the runtime resource lifecycle
 * (spec 00031: G1, G9, G10).
 *
 * `startHttpServer` is driven directly — it is the unit that owns the API port,
 * the Fastify instance and every plugin the host registered through
 * `apiRouter` — so each defect is observable without booting a database.
 */
import { afterEach, expect, test } from "bun:test";
import pg from "pg";
import { run, type Task } from "effection";
import { withEffectstreamStaticConfig } from "@effectstream/config";
import {
  acquireDBMutex,
  releaseDBMutex,
  waitUntilFree,
} from "@effectstream/db";
import type { FastifyInstance } from "fastify";
import { startHttpServer } from "../../src/api/http-server.ts";
import type { StartConfigApiRouter } from "../../src/types.ts";
import {
  closeTcp,
  connectTcp,
  freePortAbove10000,
  listenTcp,
  restoreEnv,
  saveEnv,
  settle,
  sleep,
  tcpRebindable,
  waitUntil,
  withDeadline,
} from "./support.ts";

const ENV_KEYS = [
  "EFFECTSTREAM_API_PORT",
  "ENABLE_DEV_AND_DEBUG_ENDPOINTS",
  "PGLITE",
] as const;

const STATIC_CONFIG = {
  securityNamespace: "runtime-lifecycle",
  allNetworks: { viemNetworks: {} },
};

/**
 * A pool that is never queried. Every route that touches the database is only
 * *registered* by `startHttpServer`; these tests never invoke one, so no
 * connection is ever opened.
 */
function idlePool(): pg.Pool {
  return new pg.Pool({
    host: "127.0.0.1",
    port: 1,
    user: "unused",
    database: "unused",
    max: 1,
  });
}

type Owned = {
  env: ReturnType<typeof saveEnv>;
  pools: pg.Pool[];
  tasks: Task<unknown>[];
  servers: Awaited<ReturnType<typeof listenTcp>>[];
  sockets: Awaited<ReturnType<typeof connectTcp>>[];
};

const owned: Owned = {
  env: saveEnv(ENV_KEYS),
  pools: [],
  tasks: [],
  servers: [],
  sockets: [],
};

function startServer(
  pool: pg.Pool,
  apiRouter?: StartConfigApiRouter,
): Task<unknown> {
  const task = run(function* () {
    yield* withEffectstreamStaticConfig(STATIC_CONFIG, function* () {
      yield* startHttpServer(pool, [], 60_000, apiRouter);
    });
  });
  owned.tasks.push(task);
  // start() rejects on a bind conflict; the tests that expect it observe the
  // task themselves, this only keeps the rejection from going unhandled.
  Promise.resolve(task).catch(() => {});
  return task;
}

afterEach(async () => {
  for (const socket of owned.sockets.splice(0)) socket.destroy();
  for (const task of owned.tasks.splice(0)) {
    // Bounded: on the unfixed runtime a halt can block behind an in-flight
    // request forever, and cleanup must not take the whole file down with it.
    await Promise.race([task.halt().catch(() => {}), sleep(2_000)]);
  }
  for (const server of owned.servers.splice(0)) await closeTcp(server);
  for (const pool of owned.pools.splice(0)) await pool.end().catch(() => {});
  // The DB mutex is a module global shared by every suite in this process. A
  // reproduced leak must not be inherited by the next test file.
  const mutex = waitUntilFree();
  if (mutex.db_mutex === "locked") releaseDBMutex(mutex.running.name);
  restoreEnv(owned.env);
});

test("G1: a rejected HTTP listen still runs the apiRouter's onClose hooks", async () => {
  const port = await freePortAbove10000();
  owned.servers.push(await listenTcp(port));
  process.env.EFFECTSTREAM_API_PORT = String(port);

  const closeHooks: string[] = [];
  const apiRouter: StartConfigApiRouter = (server: FastifyInstance) => {
    server.addHook("onClose", async () => {
      closeHooks.push("apiRouter");
    });
    return Promise.resolve();
  };

  const pool = idlePool();
  owned.pools.push(pool);
  const outcome = await withDeadline(settle(startServer(pool, apiRouter)));

  expect(outcome.ok).toBe(false);
  expect((outcome as { error: NodeJS.ErrnoException }).error.code).toBe(
    "EADDRINUSE",
  );
  // The Fastify instance was fully built (plugins registered, undici/hook
  // state live) before listen failed. Skipping close on a failed bind leaks it
  // and silently skips every host-registered teardown hook.
  expect(closeHooks).toEqual(["apiRouter"]);
});

// Spec 00031 Acceptance 1 for the API port. This is an acceptance guard, not a
// reproduction: it is already green on the PR base (see plan P1.4, G10a), and
// it exists so a shutdown change cannot silently regress rebindability.
test("G10a (acceptance): the API port rebinds immediately after shutdown, repeatedly, with a live keep-alive client", async () => {
  const port = await freePortAbove10000();
  process.env.EFFECTSTREAM_API_PORT = String(port);

  for (let round = 0; round < 3; round++) {
    const pool = idlePool();
    owned.pools.push(pool);
    const task = startServer(pool);
    await waitUntil(
      async () => (await fetch(`http://127.0.0.1:${port}/health`)
        .then((r) => r.status === 200 || r.status === 503)
        .catch(() => false)),
      10_000,
      `round ${round}: server listening`,
    );

    // A real keep-alive client: an idle HTTP/1.1 socket the kernel still holds
    // open. `server.close()` alone waits for it, so shutdown must force it.
    const keepAlive = await connectTcp(port);
    owned.sockets.push(keepAlive);
    keepAlive.write(
      `GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n`,
    );
    await new Promise<void>((resolve, reject) => {
      keepAlive.once("data", () => resolve());
      keepAlive.once("error", reject);
    });

    await withDeadline(task.halt(), 5_000);
    expect(await tcpRebindable(port)).toBe(true);
  }
}, 30_000);

test("G9: a per-request DB-mutex task does not outlive the HTTP server's scope", async () => {
  const port = await freePortAbove10000();
  process.env.EFFECTSTREAM_API_PORT = String(port);
  process.env.ENABLE_DEV_AND_DEBUG_ENDPOINTS = "true";
  // The mutex is a no-op unless PGLITE is on; the route exists to serialize
  // PGLite's single WASM backend, so that is the configuration under test.
  process.env.PGLITE = "true";

  const pool = idlePool();
  owned.pools.push(pool);
  const task = startServer(pool);
  await waitUntil(
    async () => (await fetch(`http://127.0.0.1:${port}/health`)
      .then((r) => r.status === 200 || r.status === 503)
      .catch(() => false)),
    10_000,
    "server listening",
  );

  // Hold the mutex so the request's `run(() => acquireDBMutex(...))` cannot
  // settle: it is now a detached Effection task with a pending acquisition.
  await run(() => acquireDBMutex("test-holder"));
  const request = settle(
    fetch(`http://127.0.0.1:${port}/db_acquire_lock?name=ghost`),
  );
  await waitUntil(
    () => waitUntilFree().waiting.some((w) => w.name === "http-server:ghost"),
    5_000,
    "request task queued on the mutex",
  );

  // Shut the runtime's HTTP scope down while that request is in flight. The
  // request is only unblockable by cancellation, so a scope that cannot reach
  // its own in-flight work never settles.
  const halted = await settle(withDeadline(task.halt(), 3_000));

  // Release unconditionally so the request can drain on either code path.
  releaseDBMutex("test-holder");
  await settle(withDeadline(request, 3_000));
  await sleep(150);

  expect(halted.ok).toBe(true);
  // Nothing the runtime owned is running any more, so the mutex the test
  // released must still be free. On the unfixed runtime the detached task
  // survives the halt and grabs it — a post-shutdown side effect.
  expect(waitUntilFree().running.name).toBe("");
  expect(waitUntilFree().db_mutex).toBe("free");
}, 20_000);
