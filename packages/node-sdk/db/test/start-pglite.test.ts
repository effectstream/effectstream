import { afterEach, expect, jest, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import net from "node:net";
import { Client } from "pg";
import {
  startPglite,
  type PgliteHandle,
} from "../scripts/start-pglite.ts";

// A test that times out inside a fake-timer window never reaches its finally
// block. Restoring real timers here keeps that from stalling later tests.
afterEach(() => {
  jest.useRealTimers();
});

const connection = (handle: PgliteHandle) => ({
  host: "127.0.0.1",
  port: handle.port,
  user: "postgres",
  database: "postgres",
  connectionTimeoutMillis: 500,
});

type PositiveClientFactory = (config: ReturnType<typeof connection>) => Client;

const createPositiveClient: PositiveClientFactory = (config) => new Client(config);

async function connect(
  handle: PgliteHandle,
  clientFactory: PositiveClientFactory = createPositiveClient,
): Promise<Client> {
  await handle.db.waitReady;
  const client = clientFactory(connection(handle));
  await client.connect();
  return client;
}

const controlledHandle = (waitReady: Promise<unknown>, port = 5432): PgliteHandle => ({
  port,
  db: { waitReady },
}) as unknown as PgliteHandle;

async function expectRefused(handle: PgliteHandle): Promise<void> {
  const probe = new Client(connection(handle));
  await expect(probe.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
}

const clientSocket = (client: Client): net.Socket =>
  (client as unknown as { connection: { stream: net.Socket } }).connection.stream;

// Resolves on the socket's next "close" event. Register it before the action
// that closes the socket. A socket that never closes fails the test at the
// runner's timeout instead of at a wall-clock bound a slow machine can miss.
const socketClosed = (socket: net.Socket): Promise<void> =>
  new Promise((resolve) => socket.once("close", () => resolve()));

const nextClientError = (client: Client): Promise<Error> =>
  new Promise((resolve) => client.once("error", resolve));

// Every promise continuation that is not blocked on I/O has run by the time
// the next immediate fires.
const nextImmediate = () => new Promise<void>((resolve) => setImmediate(resolve));

async function destroyClient(client: Client): Promise<void> {
  client.on("error", () => {});
  const closed = socketClosed(clientSocket(client));
  clientSocket(client).destroy();
  await closed;
}

function trackDatabaseClose(handle: PgliteHandle) {
  const originalDbClose = handle.db.close.bind(handle.db);
  let count = 0;
  let closed!: () => void;
  const completed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  handle.db.close = async () => {
    count += 1;
    await originalDbClose();
    closed();
  };
  return { count: () => count, completed };
}

test("positive client waits for readiness before construction", async () => {
  const order: string[] = [];
  let releaseReadiness!: () => void;
  const readinessGate = new Promise<void>((resolve) => {
    releaseReadiness = resolve;
  });
  const waitReady = readinessGate.then(() => {
    order.push("readiness");
  });
  const fakeClient = {
    connect: async () => {
      order.push("connect");
    },
  } as unknown as Client;
  let observedConfig: ReturnType<typeof connection> | undefined;
  const clientFactory: PositiveClientFactory = (config) => {
    order.push("construction");
    observedConfig = config;
    return fakeClient;
  };

  let connectionAttempt: Promise<Client> | undefined;
  try {
    // Readiness stays pending while the clock passes the client's 500 ms
    // handshake timeout. Fake timers advance that clock without waiting, and
    // nothing in this window performs I/O.
    jest.useFakeTimers();
    try {
      connectionAttempt = connect(controlledHandle(waitReady), clientFactory);
      jest.advanceTimersByTime(600);
      await nextImmediate();
      expect(order).toEqual([]);
      expect(observedConfig).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }

    releaseReadiness();
    expect(await connectionAttempt).toBe(fakeClient);
    expect(order).toEqual(["readiness", "construction", "connect"]);
    expect(observedConfig?.connectionTimeoutMillis).toBe(500);
  } finally {
    releaseReadiness();
    await connectionAttempt?.catch(() => {});
  }
});

test("positive client propagates readiness rejection before construction", async () => {
  const readinessError = new Error("controlled readiness rejection");
  const waitReady = Promise.reject(readinessError);
  void waitReady.catch(() => {});
  let constructionCount = 0;
  let connectCount = 0;
  const clientFactory: PositiveClientFactory = () => {
    constructionCount += 1;
    return {
      connect: async () => {
        connectCount += 1;
      },
    } as unknown as Client;
  };

  await expect(connect(controlledHandle(waitReady), clientFactory)).rejects.toBe(readinessError);
  expect(constructionCount).toBe(0);
  expect(connectCount).toBe(0);
});

test("positive client preserves the 500 ms post-readiness handshake timeout", async () => {
  const acceptedSockets: net.Socket[] = [];
  const stalledServer = net.createServer((socket) => {
    acceptedSockets.push(socket);
  });
  await new Promise<void>((resolve) => stalledServer.listen(0, "127.0.0.1", resolve));
  const address = stalledServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate a controlled loopback port.");
  }

  try {
    const accepted = new Promise<void>((resolve) => stalledServer.once("connection", () => resolve()));
    let attempt!: Promise<Client>;
    let settled = false;
    // Fake timers own pg's connectionTimeoutMillis timer, which connect()
    // arms with setTimeout. They stay on only until the timer has fired,
    // because Bun 1.3.10 does not time out a test that hangs while fake
    // timers are installed.
    jest.useFakeTimers();
    try {
      attempt = connect(controlledHandle(Promise.resolve(), address.port));
      attempt.then(() => { settled = true; }, () => { settled = true; });
      await accepted;
      jest.advanceTimersByTime(499);
      await nextImmediate();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
    } finally {
      jest.useRealTimers();
    }
    await expect(attempt).rejects.toMatchObject({ message: "timeout expired" });
    expect(acceptedSockets).toHaveLength(1);
  } finally {
    for (const socket of acceptedSockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      stalledServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("default and forced close settle without clients", async () => {
  const graceful = await startPglite(0);
  const forced = await startPglite(0);

  await graceful.close();
  await forced.close({ force: true });

  expect(graceful.server.listening).toBe(false);
  expect(forced.server.listening).toBe(false);
});

test("a client that drains first closes without a client error", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  const errors: Error[] = [];
  client.on("error", (error) => errors.push(error));

  await client.end();
  await handle.close();

  expect(errors).toEqual([]);
  expect(handle.server.listening).toBe(false);
});

test("default close preserves multiple retained sockets and rejects new clients", async () => {
  const handle = await startPglite(0);
  const clients = await Promise.all([connect(handle), connect(handle)]);
  const errors: Error[] = [];
  for (const client of clients) client.on("error", (error) => errors.push(error));

  await handle.close();
  await expectRefused(handle);
  // A query round trip on each retained socket proves it still serves after
  // close, and any client error emitted before the reply is already recorded.
  for (const client of clients) {
    expect((await client.query("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  }

  expect(errors).toEqual([]);
  expect(clients.every((client) => !clientSocket(client).destroyed)).toBe(true);
  await Promise.all(clients.map(destroyClient));
});

test("default close unrefs retained sockets and defers cleanup until the last drains", async () => {
  const handle = await startPglite(0);
  const acceptedSockets: net.Socket[] = [];
  handle.server.on("connection", (socket) => acceptedSockets.push(socket));
  const clients = await Promise.all([connect(handle), connect(handle)]);
  const errors: Error[] = [];
  for (const client of clients) client.on("error", (error) => errors.push(error));
  const unrefCounts = acceptedSockets.map(() => 0);
  acceptedSockets.forEach((socket, index) => {
    const originalUnref = socket.unref.bind(socket);
    socket.unref = () => {
      unrefCounts[index] += 1;
      return originalUnref();
    };
  });

  const dbClose = trackDatabaseClose(handle);

  await handle.close();
  expect(acceptedSockets).toHaveLength(2);
  expect(unrefCounts).toEqual([1, 1]);
  expect(dbClose.count()).toBe(0);
  expect((await clients[0].query("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  expect(errors).toEqual([]);

  const firstDrained = socketClosed(acceptedSockets[0]);
  clientSocket(clients[0]).destroy();
  await firstDrained;
  // A cleanup started by this close would have called db.close() by now.
  await nextImmediate();
  expect(dbClose.count()).toBe(0);

  const secondError = nextClientError(clients[1]);
  clientSocket(clients[1]).destroy();
  await dbClose.completed;
  await secondError;
  expect(dbClose.count()).toBe(1);
  expect(errors).toHaveLength(2);
  expect(errors.every((error) => error.message === "Connection terminated unexpectedly")).toBe(true);
});

test("an unrefed retained server socket does not keep its owner process alive", async () => {
  const child = Bun.spawn([
    process.execPath,
    new URL("./fixtures/pglite-close/process-exit.ts", import.meta.url).pathname,
  ], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });

  const decoder = new TextDecoder();
  let stdout = "";
  let reportPort: ((port: number) => void) | undefined;
  const portReported = new Promise<number>((resolve) => {
    reportPort = resolve;
  });
  const stdoutComplete = (async () => {
    for await (const chunk of child.stdout) {
      stdout += decoder.decode(chunk, { stream: true });
      const match = stdout.match(/PGLITE_PROCESS_EXIT_PORT:(\d+)/);
      if (match && reportPort) {
        reportPort(Number(match[1]));
        reportPort = undefined;
      }
    }
    stdout += decoder.decode();
    return stdout;
  })();
  const stderrComplete = new Response(child.stderr).text();

  let socket: net.Socket | undefined;
  try {
    const port = await portReported;
    socket = net.createConnection({ host: "127.0.0.1", port });
    socket.on("error", () => {});
    await new Promise<void>((resolve) => socket?.once("connect", resolve));

    // A retained socket that kept the child alive fails this test at the
    // runner's timeout.
    const exitCode = await child.exited;
    const [childStdout, childStderr] = await Promise.all([stdoutComplete, stderrComplete]);
    const output = `${childStdout}\n${childStderr}`;
    expect(exitCode, output).toBe(0);
    expect(output).toContain("PGLITE_PROCESS_EXIT_DEFAULT_CLOSED");
  } finally {
    socket?.destroy();
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
});

test("forced close destroys every retained socket before settling", async () => {
  const handle = await startPglite(0);
  const acceptedClosed: boolean[] = [];
  handle.server.on("connection", (socket) => {
    const index = acceptedClosed.push(false) - 1;
    socket.once("close", () => {
      acceptedClosed[index] = true;
    });
  });
  const clients = await Promise.all([connect(handle), connect(handle)]);
  const errors: Error[] = [];
  for (const client of clients) client.on("error", (error) => errors.push(error));
  // Each client learns of its destroyed server socket through these events,
  // which may arrive after close has settled.
  const clientErrors = clients.map(nextClientError);
  const clientSocketsClosed = clients.map((client) => socketClosed(clientSocket(client)));

  await handle.close({ force: true });
  expect(acceptedClosed).toEqual([true, true]);
  expect(handle.server.listening).toBe(false);

  const observed = await Promise.all(clientErrors);
  await Promise.all(clientSocketsClosed);
  expect(observed.map((error) => error.message)).toEqual([
    "Connection terminated unexpectedly",
    "Connection terminated unexpectedly",
  ]);
  expect(clients.every((client) => clientSocket(client).destroyed)).toBe(true);
  expect(errors).toHaveLength(2);
});

test("repeated and concurrent close calls share the first default operation", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  const errors: Error[] = [];
  client.on("error", (error) => errors.push(error));

  const first = handle.close();
  const sameMode = handle.close();
  const attemptedEscalation = handle.close({ force: true });

  expect(sameMode).toBe(first);
  expect(attemptedEscalation).toBe(first);
  await Promise.all([first, sameMode, attemptedEscalation]);
  // The retained socket still serves, so the forced attempt did not destroy it.
  expect((await client.query("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  expect(errors).toEqual([]);
  expect(clientSocket(client).destroyed).toBe(false);
  expect(handle.close({ force: true })).toBe(first);

  await destroyClient(client);
});

test("repeated and concurrent close calls share the first forced operation", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  client.on("error", () => {});
  const clientClosed = socketClosed(clientSocket(client));

  const first = handle.close({ force: true });
  const sameMode = handle.close({ force: true });
  const attemptedDowngrade = handle.close();

  expect(sameMode).toBe(first);
  expect(attemptedDowngrade).toBe(first);
  await Promise.all([first, sameMode, attemptedDowngrade]);
  await clientClosed;
  expect(clientSocket(client).destroyed).toBe(true);
  expect(handle.close()).toBe(first);
});

test("port zero reports the actual IPv4 loopback listener", async () => {
  const handle = await startPglite(0);
  try {
    const address = handle.server.address();
    expect(address).not.toBeNull();
    expect(typeof address).not.toBe("string");
    if (!address || typeof address === "string") return;
    expect(handle.port).toBe(address.port);
    expect(handle.port).toBeGreaterThan(0);
    expect(address.address).toBe("127.0.0.1");
    expect(address.family).toBe("IPv4");
  } finally {
    await handle.close({ force: true });
  }
});

test("occupied-port startup rejects and closes the created PGlite instance", async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const address = blocker.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a port.");

  const originalClose = PGlite.prototype.close;
  let dbCloseCount = 0;
  PGlite.prototype.close = async function () {
    dbCloseCount += 1;
    return await originalClose.call(this);
  };

  try {
    await expect(startPglite(address.port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(dbCloseCount).toBe(1);
  } finally {
    PGlite.prototype.close = originalClose;
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("startup reports both listen and database-cleanup failures deterministically", async () => {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const address = blocker.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a port.");

  const originalClose = PGlite.prototype.close;
  const databaseError = new Error("injected startup database close failure");
  PGlite.prototype.close = async function () {
    await originalClose.call(this);
    throw databaseError;
  };

  try {
    try {
      await startPglite(address.port);
      throw new Error("startup unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      const errors = (error as AggregateError).errors;
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatchObject({ code: "EADDRINUSE" });
      expect(errors[1]).toBe(databaseError);
    }
  } finally {
    PGlite.prototype.close = originalClose;
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("listener close failure still closes the database and remains shared", async () => {
  const handle = await startPglite(0);
  const originalServerClose = handle.server.close.bind(handle.server);
  const originalDbClose = handle.db.close.bind(handle.db);
  const listenerError = new Error("injected listener close failure");
  let dbCloseCount = 0;

  handle.server.close = ((callback?: (error?: Error) => void) => {
    callback?.(listenerError);
    return handle.server;
  }) as typeof handle.server.close;
  handle.db.close = async () => {
    dbCloseCount += 1;
    await originalDbClose();
  };

  const first = handle.close();
  const repeated = handle.close({ force: true });
  expect(repeated).toBe(first);
  await expect(first).rejects.toBe(listenerError);
  await expect(repeated).rejects.toBe(listenerError);
  expect(dbCloseCount).toBe(1);

  handle.server.close = originalServerClose as typeof handle.server.close;
  await new Promise<void>((resolve, reject) => {
    originalServerClose((error) => error ? reject(error) : resolve());
  });
});

test("multiple cleanup failures are deterministic and database cleanup is attempted once", async () => {
  const handle = await startPglite(0);
  const originalServerClose = handle.server.close.bind(handle.server);
  const originalDbClose = handle.db.close.bind(handle.db);
  const listenerError = new Error("injected listener close failure");
  const databaseError = new Error("injected database close failure");
  let dbCloseCount = 0;

  handle.server.close = ((callback?: (error?: Error) => void) => {
    callback?.(listenerError);
    return handle.server;
  }) as typeof handle.server.close;
  handle.db.close = async () => {
    dbCloseCount += 1;
    throw databaseError;
  };

  const cleanup = handle.close({ force: true });
  try {
    await cleanup;
    throw new Error("cleanup unexpectedly succeeded");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([listenerError, databaseError]);
  }
  expect(handle.close()).toBe(cleanup);
  await expect(handle.close()).rejects.toBeInstanceOf(AggregateError);
  expect(dbCloseCount).toBe(1);

  handle.server.close = originalServerClose as typeof handle.server.close;
  handle.db.close = originalDbClose;
  await new Promise<void>((resolve, reject) => {
    originalServerClose((error) => error ? reject(error) : resolve());
  });
  await originalDbClose();
});

test("an externally stopped listener still permits database cleanup", async () => {
  const handle = await startPglite(0);
  await new Promise<void>((resolve, reject) => {
    handle.server.close((error) => error ? reject(error) : resolve());
  });

  await handle.close({ force: true });
  expect(handle.server.listening).toBe(false);
});

test("forced close awaits a live socket and an externally closing listener", async () => {
  const handle = await startPglite(0);
  let acceptedSocket: net.Socket | undefined;
  handle.server.once("connection", (socket) => {
    acceptedSocket = socket;
  });
  const client = await connect(handle);
  client.on("error", () => {});
  if (!acceptedSocket) throw new Error("The gateway did not track the accepted socket.");

  const order: string[] = [];
  let acceptedSocketClosed = false;
  let listenerCloseComplete = false;
  acceptedSocket.once("close", () => {
    acceptedSocketClosed = true;
    order.push("socket-close");
  });

  const originalDbClose = handle.db.close.bind(handle.db);
  handle.db.close = async () => {
    order.push("db-close");
  };

  const externalListenerClose = new Promise<void>((resolve, reject) => {
    handle.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      listenerCloseComplete = true;
      order.push("listener-close");
      resolve();
    });
  });

  try {
    await handle.close({ force: true });
    order.push("handle-close-resolved");

    expect(acceptedSocketClosed).toBe(true);
    expect(listenerCloseComplete).toBe(true);
    expect(order.indexOf("socket-close")).toBeLessThan(order.indexOf("db-close"));
    expect(order.indexOf("listener-close")).toBeLessThan(order.indexOf("db-close"));
    expect(order.at(-1)).toBe("handle-close-resolved");
  } finally {
    await externalListenerClose;
    handle.db.close = originalDbClose;
    await originalDbClose();
    clientSocket(client).destroy();
  }
});

test("a genuine PostgreSQL query error remains visible", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  client.on("error", () => {});
  try {
    await expect(client.query("SELECT * FROM table_that_does_not_exist")).rejects.toMatchObject({
      code: "42P01",
    });
  } finally {
    await handle.close({ force: true });
  }
});

test("default close settles while an in-flight query completes on its retained socket", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  const errors: Error[] = [];
  client.on("error", (error) => errors.push(error));

  // Hold the query inside the serialized PGlite queue, so close begins while
  // it is in flight on every machine.
  const originalExec = handle.db.execProtocolRaw.bind(handle.db);
  let releaseQuery!: () => void;
  let queryEntered!: () => void;
  const queryGate = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const queryStarted = new Promise<void>((resolve) => {
    queryEntered = resolve;
  });
  handle.db.execProtocolRaw = async (...args) => {
    queryEntered();
    await queryGate;
    return await originalExec(...args);
  };

  const query = client.query("SELECT 1 AS value");
  await queryStarted;
  await handle.close();
  releaseQuery();
  const result = await query;

  expect(result.rows).toEqual([{ value: 1 }]);
  expect(errors).toEqual([]);
  await destroyClient(client);
});

test("default close drains a query submitted by an accepted client as close begins", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  const errors: Error[] = [];
  client.on("error", (error) => errors.push(error));

  const cleanup = handle.close();
  const result = await client.query("SELECT 1 AS value");
  await cleanup;

  expect(result.rows).toEqual([{ value: 1 }]);
  expect(errors).toEqual([]);
  await destroyClient(client);
});

test("last socket close waits for final serialized work before deferred database cleanup", async () => {
  const handle = await startPglite(0);
  let acceptedSocket: net.Socket | undefined;
  handle.server.once("connection", (socket) => {
    acceptedSocket = socket;
  });
  const client = await connect(handle);
  client.on("error", () => {});

  const originalExec = handle.db.execProtocolRaw.bind(handle.db);
  let releaseQuery!: () => void;
  let queryEntered!: () => void;
  const queryGate = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const queryStarted = new Promise<void>((resolve) => {
    queryEntered = resolve;
  });
  handle.db.execProtocolRaw = async (...args) => {
    queryEntered();
    await queryGate;
    return await originalExec(...args);
  };
  const dbClose = trackDatabaseClose(handle);

  const query = client.query("SELECT 1 AS value").catch(() => undefined);
  await queryStarted;
  if (!acceptedSocket) throw new Error("The gateway did not track the accepted socket.");
  const acceptedClosed = socketClosed(acceptedSocket);
  clientSocket(client).destroy();
  await acceptedClosed;
  const cleanup = handle.close();
  // Registered after close() so it runs after close's own listener callback;
  // one immediate later, close has gone as far as it can without the query.
  const listenerClosed = new Promise<void>((resolve) => handle.server.once("close", () => resolve()));
  await listenerClosed;
  await nextImmediate();
  expect(dbClose.count()).toBe(0);

  releaseQuery();
  await cleanup;
  await query;
  await dbClose.completed;
  expect(dbClose.count()).toBe(1);
});

test("a late deferred database-cleanup failure is observed without rejecting settled close", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  client.on("error", () => {});
  const originalDbClose = handle.db.close.bind(handle.db);
  const originalConsoleError = console.error;
  const databaseError = new Error("injected deferred database close failure");
  const observed: unknown[][] = [];
  let failureLogged!: () => void;
  const failureWasLogged = new Promise<void>((resolve) => {
    failureLogged = resolve;
  });
  handle.db.close = async () => {
    throw databaseError;
  };
  console.error = (...args: unknown[]) => {
    observed.push(args);
    failureLogged();
  };

  try {
    await handle.close();
    clientSocket(client).destroy();
    await failureWasLogged;
    expect(observed).toHaveLength(1);
    expect(observed[0][0]).toBe("database: deferred PGlite cleanup failed");
    expect(observed[0][1]).toBe(databaseError);
    expect(handle.close({ force: true })).toBe(handle.close());
  } finally {
    console.error = originalConsoleError;
    handle.db.close = originalDbClose;
    await originalDbClose();
  }
});
