import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import net from "node:net";
import { Client } from "pg";
import {
  startPglite,
  type PgliteHandle,
} from "../scripts/start-pglite.ts";

const connection = (handle: PgliteHandle) => ({
  host: "127.0.0.1",
  port: handle.port,
  user: "postgres",
  database: "postgres",
  connectionTimeoutMillis: 500,
});

async function connect(handle: PgliteHandle): Promise<Client> {
  const client = new Client(connection(handle));
  await client.connect();
  return client;
}

async function expectRefused(handle: PgliteHandle): Promise<void> {
  const probe = new Client(connection(handle));
  await expect(probe.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
}

const clientSocket = (client: Client): net.Socket =>
  (client as unknown as { connection: { stream: net.Socket } }).connection.stream;

async function destroyHandled(client: Client): Promise<Error[]> {
  const errors: Error[] = [];
  client.on("error", (error) => errors.push(error));
  clientSocket(client).destroy();
  await Bun.sleep(20);
  return errors;
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
    await Bun.sleep(10);
  }
}

test("default and forced close are bounded without clients", async () => {
  const graceful = await startPglite(0);
  const forced = await startPglite(0);

  await Promise.race([
    graceful.close(),
    Bun.sleep(2_000).then(() => Promise.reject(new Error("default close timed out"))),
  ]);
  await Promise.race([
    forced.close({ force: true }),
    Bun.sleep(2_000).then(() => Promise.reject(new Error("forced close timed out"))),
  ]);

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

  await Promise.race([
    handle.close(),
    Bun.sleep(2_000).then(() => Promise.reject(new Error("default close timed out"))),
  ]);
  await expectRefused(handle);
  await Bun.sleep(20);

  expect(errors).toEqual([]);
  expect(clients.every((client) => !clientSocket(client).destroyed)).toBe(true);
  for (const client of clients) clientSocket(client).destroy();
  await Bun.sleep(20);
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

  const originalDbClose = handle.db.close.bind(handle.db);
  let dbCloseCount = 0;
  let dbCloseComplete = false;
  handle.db.close = async () => {
    dbCloseCount += 1;
    await originalDbClose();
    dbCloseComplete = true;
  };

  await handle.close();
  expect(acceptedSockets).toHaveLength(2);
  expect(unrefCounts).toEqual([1, 1]);
  expect(dbCloseCount).toBe(0);
  expect((await clients[0].query("SELECT 1 AS value")).rows).toEqual([{ value: 1 }]);
  expect(errors).toEqual([]);

  clientSocket(clients[0]).destroy();
  await waitFor(() => acceptedSockets[0].destroyed, "the first accepted socket to drain");
  expect(dbCloseCount).toBe(0);

  clientSocket(clients[1]).destroy();
  await waitFor(() => dbCloseComplete, "deferred PGlite cleanup");
  expect(dbCloseCount).toBe(1);
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
    const port = await Promise.race([
      portReported,
      Bun.sleep(5_000).then(() => Promise.reject(new Error("child did not report its port"))),
    ]);
    socket = net.createConnection({ host: "127.0.0.1", port });
    socket.on("error", () => {});
    await new Promise<void>((resolve) => socket?.once("connect", resolve));

    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(5_000).then(() => Promise.reject(
        new Error(`retained socket kept child alive; stdout so far: ${stdout}`),
      )),
    ]);
    const [childStdout, childStderr] = await Promise.all([stdoutComplete, stderrComplete]);
    const output = `${childStdout}\n${childStderr}`;
    expect(exitCode, output).toBe(0);
    expect(output).toContain("PGLITE_PROCESS_EXIT_DEFAULT_CLOSED");
  } finally {
    socket?.destroy();
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}, 15_000);

test("forced close destroys every retained socket before settling", async () => {
  const handle = await startPglite(0);
  const clients = await Promise.all([connect(handle), connect(handle)]);
  const errors: Error[] = [];
  for (const client of clients) client.on("error", (error) => errors.push(error));

  await handle.close({ force: true });
  await Bun.sleep(20);

  expect(clients.every((client) => clientSocket(client).destroyed)).toBe(true);
  expect(errors).toHaveLength(2);
  expect(errors.every((error) => error.message === "Connection terminated unexpectedly")).toBe(true);
  expect(handle.server.listening).toBe(false);
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
  await Bun.sleep(20);
  expect(errors).toEqual([]);
  expect(clientSocket(client).destroyed).toBe(false);
  expect(handle.close({ force: true })).toBe(first);

  clientSocket(client).destroy();
  await Bun.sleep(20);
});

test("repeated and concurrent close calls share the first forced operation", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  client.on("error", () => {});

  const first = handle.close({ force: true });
  const sameMode = handle.close({ force: true });
  const attemptedDowngrade = handle.close();

  expect(sameMode).toBe(first);
  expect(attemptedDowngrade).toBe(first);
  await Promise.all([first, sameMode, attemptedDowngrade]);
  await Bun.sleep(20);
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

  const query = client.query("SELECT pg_sleep(0.05), 1 AS value");
  await Bun.sleep(10);
  const cleanup = handle.close();
  await cleanup;
  const result = await query;

  expect(result.rows).toHaveLength(1);
  expect(errors).toEqual([]);
  await destroyHandled(client);
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
  await destroyHandled(client);
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
  const originalDbClose = handle.db.close.bind(handle.db);
  let releaseQuery!: () => void;
  let queryEntered!: () => void;
  const queryGate = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const queryStarted = new Promise<void>((resolve) => {
    queryEntered = resolve;
  });
  let dbCloseCount = 0;
  let dbCloseComplete = false;
  handle.db.execProtocolRaw = async (...args) => {
    queryEntered();
    await queryGate;
    return await originalExec(...args);
  };
  handle.db.close = async () => {
    dbCloseCount += 1;
    await originalDbClose();
    dbCloseComplete = true;
  };

  const query = client.query("SELECT 1 AS value").catch(() => undefined);
  await queryStarted;
  clientSocket(client).destroy();
  await waitFor(() => acceptedSocket?.destroyed === true, "the final accepted socket to close");
  const cleanup = handle.close();
  await Bun.sleep(20);
  expect(dbCloseCount).toBe(0);

  releaseQuery();
  await cleanup;
  await query;
  await waitFor(() => dbCloseComplete, "database cleanup after final serialized work");
  expect(dbCloseCount).toBe(1);
});

test("a late deferred database-cleanup failure is observed without rejecting settled close", async () => {
  const handle = await startPglite(0);
  const client = await connect(handle);
  client.on("error", () => {});
  const originalDbClose = handle.db.close.bind(handle.db);
  const originalConsoleError = console.error;
  const databaseError = new Error("injected deferred database close failure");
  const observed: unknown[][] = [];
  handle.db.close = async () => {
    throw databaseError;
  };
  console.error = (...args: unknown[]) => observed.push(args);

  try {
    await handle.close();
    clientSocket(client).destroy();
    await waitFor(() => observed.length === 1, "the deferred cleanup failure to be observed");
    expect(observed[0][0]).toBe("database: deferred PGlite cleanup failed");
    expect(observed[0][1]).toBe(databaseError);
    expect(handle.close({ force: true })).toBe(handle.close());
  } finally {
    console.error = originalConsoleError;
    handle.db.close = originalDbClose;
    await originalDbClose();
  }
});
