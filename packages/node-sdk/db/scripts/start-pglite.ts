import { type DebugLevel, PGlite } from "@electric-sql/pglite";
// TODO This is not working, so we load the pg_ivm extension from the node_modules folder
// import { pg_ivm } from "@electric-sql/pglite/pg_ivm";
import net from "node:net";
import { statSync } from "node:fs";
import { fromNodeSocket } from "pg-gateway/node";
import { ENV } from "@effectstream/utils/node-env";
import { args, cwd } from "@effectstream/utils/runtime";

export interface PgliteHandle {
  server: net.Server;
  db: PGlite;
  port: number;
  close: () => Promise<void>;
}

export async function startPglite(port = 5432): Promise<PgliteHandle> {
  // Resolve pg_ivm extension path via import.meta.resolve (works with bun's hoisting)
  const pgliteEntry = import.meta.resolve("@electric-sql/pglite");
  const pgliteDir = pgliteEntry.replace(/\/dist\/[^/]+$/, "");
  const pgIvmUrl = new URL(`${pgliteDir}/dist/pg_ivm.tar.gz`);

  const db = new PGlite(
    ENV.PGLITE_DATA_DIR,
    {
      username: ENV.DB_USER,
      database: ENV.DB_NAME,
      extensions: {
        pg_ivm: pgIvmUrl,
      },
      debug: (ENV.DEBUG_PGLITE as DebugLevel) || 0,
    },
  );

  // Serialize every client's execProtocolRaw through one promise chain
  // PGlite allows only one in-flight query, and per-process db_mutex can't coordinate across separate TCP clients.
  let queue: Promise<unknown> = Promise.resolve();

  // TODO: consider switching to pglite-socket once it works
  //       https://discord.com/channels/933657521581858818/1371976702674075780/1371992712076595250
  const server = net.createServer(async (socket) => {
    await fromNodeSocket(socket, {
      serverVersion: "16.3",

      auth: {
        // No password required
        method: "trust",
      },

      async onStartup() {
        // Wait for PGlite to be ready before further processing
        await db.waitReady;
      },

      // Hook into each client message
      async onMessage(data, { isAuthenticated }) {
        // Only forward messages to PGlite after authentication
        if (!isAuthenticated) {
          return;
        }

        // Forward raw message to PGlite and send response to client, serialized
        // through the queue so the single WASM backend handles one at a time.
        const run = queue.then(() => db.execProtocolRaw(data));
        queue = run.catch(() => {}); // keep the chain alive even if a query errors
        return await run;
      },
    });
  });

  const sockets = new Set<net.Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await db.close();
    throw new Error("Unable to determine the PGlite gateway port.");
  }
  const actualPort = address.port;
  console.info(`database: server listening on port ${actualPort}`);

  let closed = false;

  return {
    server,
    db,
    port: actualPort,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
      await db.close();
    },
  };
}

if (import.meta.main) {
  // TODO PORT be a ENV variable
  // Get port from arguments.
  const portArgName = "--port";
  const argv = args();
  const portArgIndex = argv.indexOf(portArgName);
  const portValue = portArgIndex !== -1 ? argv[portArgIndex + 1] : "5432";
  const port = parseInt(portValue);
  if (isNaN(port)) {
    throw new Error(`Port argument ${portArgName} is not a number`);
  }
  await startPglite(port);
}
