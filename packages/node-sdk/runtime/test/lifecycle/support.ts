/**
 * Shared helpers for the runtime resource-lifecycle reproductions.
 *
 * Every bind in this suite uses an OS-selected port above 10000 (never the
 * 9999/8883/8884 product defaults) so the suite is safe on a shared machine and
 * can run concurrently with anything else.
 */
import net, { type AddressInfo, type Server, type Socket } from "node:net";

/** Grab an OS-selected free TCP port above 10000. */
export async function freePortAbove10000(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await closeTcp(server);
    if (port > 10_000) return port;
  }
  throw new Error("Unable to acquire an OS-selected port above 10000");
}

/** N distinct free ports above 10000. */
export async function freeDistinctPorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) ports.add(await freePortAbove10000());
  return [...ports];
}

/**
 * Occupy `port`. Defaults to the wildcard address because the runtime's HTTP
 * server binds `0.0.0.0`: on BSD/macOS a loopback-only holder does NOT conflict
 * with a wildcard bind, so a `127.0.0.1` blocker would silently fail to block.
 */
export async function listenTcp(
  port: number,
  host = "0.0.0.0",
): Promise<Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

export async function closeTcp(server?: Server): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** True when `port` can be bound again right now. */
export async function tcpRebindable(
  port: number,
  host = "0.0.0.0",
): Promise<boolean> {
  try {
    const server = await listenTcp(port, host);
    await closeTcp(server);
    return true;
  } catch {
    return false;
  }
}

/** True once a TCP connection to `port` succeeds; never rejects. */
export function tcpConnects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

export async function connectTcp(port: number): Promise<Socket> {
  const socket = net.connect({ port, host: "127.0.0.1" });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return socket;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `check` until it is true, or throw after `ms`. */
export async function waitUntil(
  check: () => boolean | Promise<boolean>,
  ms = 5_000,
  label = "condition",
): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= end) throw new Error(`${label} not met within ${ms}ms`);
    await sleep(5);
  }
}

/** Resolve `promise`, or throw once `ms` has elapsed. */
export async function withDeadline<T>(
  promise: PromiseLike<T>,
  ms = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`deadline exceeded after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Settle a promise into `{ ok }` / `{ ok: false, error }` without throwing. */
export async function settle<T>(
  promise: PromiseLike<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

export type EnvSnapshot = Record<string, string | undefined>;

export function saveEnv(keys: readonly string[]): EnvSnapshot {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

export function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
