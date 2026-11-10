/**
 * Subprocess fixture shaped like a real Effectstream application: effection
 * `main`, then `init()`, then `start()` inside the static config, then
 * `suspend()`.
 *
 * The shape is the point. `main` keeps the process alive for as long as its
 * body runs, and the body suspends after `start()`, so the process only ends if
 * `start()` itself throws. A failure that `start()` records but does not throw
 * leaves this process running with nothing printed, which is what the parent
 * test detects.
 *
 * The database is an in-memory PGlite without the `pg_ivm` extension, served
 * over the PostgreSQL wire protocol on 127.0.0.1. Startup therefore takes the
 * same path as on a stock PostgreSQL server that lacks `pg_ivm`.
 *
 * The fixture prints nothing itself: whatever reaches stdout or stderr comes
 * from effection `main` and the runtime, as in a real application.
 *
 * Usage: `bun startup-failure-app.ts '<json Spec>'`
 */
import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { fromNodeSocket } from "pg-gateway/node";
import { main, suspend } from "effection";
import type { StartConfigGameStateTransitions } from "../../../src/types.ts";

export type Spec = {
  mode: "missing-pg-ivm" | "allow-no-pg-ivm" | "api-port-in-use";
  dbPort: number;
  apiPort: number;
};

const spec: Spec = JSON.parse(process.argv[2] ?? "{}");

/**
 * Serve an in-memory PGlite, with no extensions loaded, on `127.0.0.1:port`.
 *
 * PGlite runs one query at a time, so every client's messages go through one
 * promise chain. The process ends through effection `main`, which exits it, so
 * the server needs no teardown.
 */
async function serveDatabaseWithoutPgIvm(port: number): Promise<void> {
  const db = new PGlite();
  await db.waitReady;
  let queue: Promise<unknown> = Promise.resolve();

  const server = net.createServer((socket) => {
    // A client dropping its connection must not crash the application under
    // test; the runtime reports its own database errors.
    socket.on("error", () => {});
    void fromNodeSocket(socket, {
      serverVersion: "16.3",
      auth: { method: "trust" },
      async onStartup() {
        await db.waitReady;
      },
      async onMessage(data, { isAuthenticated }) {
        if (!isAuthenticated) return;
        const result = queue.then(() => db.execProtocolRaw(data));
        queue = result.catch(() => {});
        return await result;
      },
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

// Set before the runtime modules are imported below, so nothing can read a
// stale value. `PGLITE=true` selects the engine's single-connection mode, which
// the one-session PGlite backend behind the gateway needs.
process.env.PGLITE = "true";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = String(spec.dbPort);
process.env.DB_NAME = "postgres";
process.env.DB_USER = "postgres";
process.env.DB_PW = "";
process.env.EFFECTSTREAM_API_PORT = String(spec.apiPort);
process.env.MQTT_BROKER = "false";
process.env.EFFECTSTREAM_COALESCE_EMPTY_BLOCKS = "false";
// No collector runs here; an unreachable-collector flush would only add noise.
process.env.OTEL_SDK_DISABLED = "true";
if (spec.mode === "missing-pg-ivm") {
  delete process.env.ALLOW_NO_PG_IVM;
} else {
  process.env.ALLOW_NO_PG_IVM = "true";
}

const { toSyncProtocolWithNetwork, withEffectstreamStaticConfig } =
  await import("@effectstream/config");
const { TestChainControl } = await import("@effectstream/sync");
const { init, start } = await import("../../../src/main.ts");
const { buildConfig, TEST_PRIMITIVE_TYPE, TestEventPrimitive } = await import(
  "../../reproduction/scenario.ts"
);

await serveDatabaseWithoutPgIvm(spec.dbPort);

const cfg = buildConfig({ securityNamespace: "startup-failure", events: [] });
const syncInfo = toSyncProtocolWithNetwork(cfg);
// Explicit, tiny tips. Without them the synthetic TEST chain falls back to a
// wall-clock tip and the node tries to sync decades of blocks.
for (const entry of syncInfo) {
  TestChainControl.setTip(entry.syncProtocol.name, 3);
}

const noopStf: StartConfigGameStateTransitions = function* () {};

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(cfg, function* () {
    yield* start({
      appName: "startup-failure",
      appVersion: "1.0.0",
      syncInfo,
      gameStateTransitions: noopStf,
      userDefinedPrimitives: { [TEST_PRIMITIVE_TYPE]: TestEventPrimitive },
      events: false,
      dev: { resetPublicData: false },
    });
  });
  yield* suspend();
});
