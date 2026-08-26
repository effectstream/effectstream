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
  close: (options?: PgliteCloseOptions) => Promise<void>;
}

export interface PgliteCloseOptions {
  /**
   * Destroy accepted client sockets before closing the gateway. Use this only
   * when the caller owns those clients and has installed their error handling.
   */
  force?: boolean;
}

interface ListenerCloseLifecycle {
  complete: () => boolean;
  completion: Promise<void>;
}

function throwCleanupErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

async function destroyTrackedSockets(sockets: Set<net.Socket>): Promise<void> {
  while (sockets.size > 0) {
    const tracked = [...sockets];
    const closed = tracked.map((socket) => new Promise<void>((resolve) => {
      socket.once("close", resolve);
    }));
    for (const socket of tracked) socket.destroy();
    await Promise.all(closed);
  }
}

async function closeListener(
  server: net.Server,
  sockets: Set<net.Socket>,
  force: boolean,
  lifecycle: ListenerCloseLifecycle,
  waitForAcceptedSockets = true,
): Promise<void> {
  const socketTeardown = force ? destroyTrackedSockets(sockets) : undefined;

  if (!server.listening) {
    await socketTeardown;
    if (force && !lifecycle.complete()) await lifecycle.completion;
    return;
  }

  if (!waitForAcceptedSockets) {
    // `server.close(callback)` keeps Bun's listener-close lifecycle referenced
    // until every preserved socket drains. The compatibility path cannot await
    // that lifecycle, so initiate close without a callback after unrefing the
    // listener and accepted sockets. Synchronous initiation failures still
    // reject this operation.
    server.close();
    return;
  }

  let listenerError: unknown;
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    listenerError = error;
  }

  await socketTeardown;
  if (listenerError !== undefined) throw listenerError;
}

async function closeResources(
  server: net.Server,
  db: PGlite,
  sockets: Set<net.Socket>,
  force: boolean,
  lifecycle: ListenerCloseLifecycle,
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await closeListener(server, sockets, force, lifecycle);
  } catch (error) {
    errors.push(error);
  }

  try {
    await db.close();
  } catch (error) {
    errors.push(error);
  }

  throwCleanupErrors(errors, "Failed to close the PGlite gateway and database.");
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

  let listenerCloseComplete = false;
  const listenerCloseCompletion = new Promise<void>((resolve) => {
    server.once("close", () => {
      listenerCloseComplete = true;
      resolve();
    });
  });
  const listenerLifecycle: ListenerCloseLifecycle = {
    complete: () => listenerCloseComplete,
    completion: listenerCloseCompletion,
  };

  const sockets = new Set<net.Socket>();
  let defaultCleanupDeferred = false;
  let databaseCleanupPromise: Promise<void> | undefined;
  let deferredCleanupObserved = false;

  const closeDatabase = (): Promise<void> => {
    databaseCleanupPromise ??= Promise.resolve().then(async () => {
      // Once no accepted socket can deliver more ingress, finish the final live
      // serialized operation before closing its PGlite backend.
      await queue;
      await db.close();
    });
    return databaseCleanupPromise;
  };

  const observeDeferredDatabaseCleanup = (): void => {
    if (deferredCleanupObserved) return;
    deferredCleanupObserved = true;
    void closeDatabase().catch((error) => {
      console.error("database: deferred PGlite cleanup failed", error);
    });
  };

  server.on("connection", (socket) => {
    sockets.add(socket);
    if (defaultCleanupDeferred) socket.unref();
    socket.once("close", () => {
      sockets.delete(socket);
      if (defaultCleanupDeferred && sockets.size === 0) {
        observeDeferredDatabaseCleanup();
      }
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (listenError) {
    const errors: unknown[] = [listenError];
    try {
      await db.close();
    } catch (dbError) {
      errors.push(dbError);
    }
    throwCleanupErrors(errors, "Failed to start the PGlite gateway and close its database.");
    throw listenError;
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    const addressError = new Error("Unable to determine the PGlite gateway port.");
    const errors: unknown[] = [addressError];
    try {
      await closeResources(server, db, sockets, true, listenerLifecycle);
    } catch (cleanupError) {
      if (cleanupError instanceof AggregateError) errors.push(...cleanupError.errors);
      else errors.push(cleanupError);
    }
    throwCleanupErrors(errors, "Unable to determine and clean up the PGlite gateway.");
    throw addressError;
  }
  const actualPort = address.port;
  console.info(`database: server listening on port ${actualPort}`);

  let cleanupPromise: Promise<void> | undefined;

  const closeDefault = async (): Promise<void> => {
    const errors: unknown[] = [];
    const deferDatabaseCleanup = sockets.size > 0;
    if (deferDatabaseCleanup) {
      defaultCleanupDeferred = true;
      server.unref();
      for (const socket of sockets) socket.unref();
    }

    try {
      await closeListener(
        server,
        sockets,
        false,
        listenerLifecycle,
        !deferDatabaseCleanup,
      );
    } catch (error) {
      errors.push(error);
    }

    if (!deferDatabaseCleanup) {
      try {
        await closeDatabase();
      } catch (error) {
        errors.push(error);
      }
    } else {
      if (sockets.size === 0) observeDeferredDatabaseCleanup();
    }

    throwCleanupErrors(errors, "Failed to close the PGlite gateway and database.");
  };

  const closeForced = async (): Promise<void> => {
    const errors: unknown[] = [];
    try {
      await closeListener(server, sockets, true, listenerLifecycle);
    } catch (error) {
      errors.push(error);
    }
    try {
      await closeDatabase();
    } catch (error) {
      errors.push(error);
    }
    throwCleanupErrors(errors, "Failed to close the PGlite gateway and database.");
  };

  return {
    server,
    db,
    port: actualPort,
    close: (options = {}) => {
      cleanupPromise ??= options.force === true ? closeForced() : closeDefault();
      return cleanupPromise;
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
