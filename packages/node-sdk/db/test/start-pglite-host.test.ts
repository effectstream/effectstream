import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import net from "node:net";
import os from "node:os";
import { Client } from "pg";
import { startPglite } from "../scripts/start-pglite.ts";

const gatewayScript = new URL("../scripts/start-pglite.ts", import.meta.url).pathname;
const repoRoot = new URL("../../../..", import.meta.url).pathname;

// TEST-NET-1 (RFC 5737): reserved for documentation, never assigned to an interface.
const UNASSIGNED_ADDRESS = "192.0.2.1";

function localIPv4Addresses(): os.NetworkInterfaceInfo[] {
  return Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4");
}

/**
 * A non-loopback address of this machine. Connecting through it is the only
 * local way to tell a loopback-only listener from a wider one, so a machine
 * without one fails these tests instead of skipping them.
 */
function externalIPv4(): string {
  const external = localIPv4Addresses().find((address) => !address.internal);
  if (!external) {
    throw new Error(
      "No non-internal IPv4 address on this machine; these tests need one to tell a loopback-only listener from a wider one.",
    );
  }
  return external.address;
}

/** Runs `SELECT 1` through the gateway at `host:port`; a refused connection rejects. */
async function selectOne(host: string, port: number): Promise<unknown> {
  const client = new Client({ host, port, user: "postgres", database: "postgres" });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 AS one");
    return result.rows[0].one;
  } finally {
    await client.end();
  }
}

/** Settles on the socket's own `connect` or `error` event: "connected" or the error code. */
function tcpProbe(host: string, port: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve(error.code ?? String(error));
    });
  });
}

interface Listening {
  port: number;
  host: string;
}

interface CliProcess {
  child: ReturnType<typeof Bun.spawn>;
  /** Resolves on the start-up line; rejects when stdout ends without it (the CLI exited first). */
  listening: Promise<Listening>;
  stderr: Promise<string>;
}

const STARTUP_LINE = /database: server listening on port (\d+) \(host ([^)]+)\)/;

/** Starts the gateway CLI with `PGLITE_HOST` set to `pgliteHost`, or unset when it is undefined. */
function spawnCli(cliArgs: string[], pgliteHost: string | undefined): CliProcess {
  const env: Record<string, string | undefined> = { ...process.env, PGLITE_DATA_DIR: "memory://" };
  if (pgliteHost === undefined) delete env.PGLITE_HOST;
  else env.PGLITE_HOST = pgliteHost;

  const child = Bun.spawn([process.execPath, gatewayScript, ...cliArgs], {
    cwd: repoRoot,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = new Response(child.stderr).text();

  let resolveListening!: (value: Listening) => void;
  let rejectListening!: (error: unknown) => void;
  const listening = new Promise<Listening>((resolve, reject) => {
    resolveListening = resolve;
    rejectListening = reject;
  });
  // A test that only waits for the exit never awaits this promise.
  listening.catch(() => {});

  void (async () => {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let stdout = "";
    let found = false;
    // Keep draining after the match so the child never blocks on a full pipe.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stdout += decoder.decode(value, { stream: true });
      const match = found ? null : stdout.match(STARTUP_LINE);
      if (match) {
        found = true;
        resolveListening({ port: Number(match[1]), host: match[2]! });
      }
    }
    if (!found) {
      throw new Error(
        `The CLI exited (code ${await child.exited}) before listening.\nstdout:\n${stdout}\nstderr:\n${await stderr}`,
      );
    }
  })().catch(rejectListening);

  return { child, listening, stderr };
}

async function stopCli(cli: CliProcess): Promise<void> {
  if (cli.child.exitCode === null) cli.child.kill();
  await cli.child.exited;
}

test("without a host the gateway accepts loopback clients and refuses a non-loopback address", async () => {
  const external = externalIPv4();
  const handle = await startPglite(0);
  try {
    expect(await selectOne("127.0.0.1", handle.port)).toBe(1);
    expect(await tcpProbe(external, handle.port)).toBe("ECONNREFUSED");
  } finally {
    await handle.close({ force: true });
  }
});

test("host 0.0.0.0 makes the gateway reachable through a non-loopback address", async () => {
  const external = externalIPv4();
  const handle = await startPglite(0, { host: "0.0.0.0" });
  try {
    expect(await selectOne(external, handle.port)).toBe(1);
  } finally {
    await handle.close({ force: true });
  }
});

test("a specific host binds that address only", async () => {
  const external = externalIPv4();
  const handle = await startPglite(0, { host: external });
  try {
    expect(await selectOne(external, handle.port)).toBe(1);
    expect(await tcpProbe("127.0.0.1", handle.port)).toBe("ECONNREFUSED");
  } finally {
    await handle.close({ force: true });
  }
});

test("a host the machine does not have rejects with the listen error and closes the database", async () => {
  expect(localIPv4Addresses().map((address) => address.address)).not.toContain(UNASSIGNED_ADDRESS);

  const closedDatabases: PGlite[] = [];
  const originalClose = PGlite.prototype.close;
  PGlite.prototype.close = async function (this: PGlite) {
    await originalClose.call(this);
    closedDatabases.push(this);
  };
  try {
    await expect(startPglite(0, { host: UNASSIGNED_ADDRESS })).rejects.toMatchObject({
      code: "EADDRNOTAVAIL",
    });
    expect(closedDatabases).toHaveLength(1);
    expect(closedDatabases[0]!.closed).toBe(true);
  } finally {
    PGlite.prototype.close = originalClose;
  }
});

test("CLI --host makes the gateway reachable through a non-loopback address", async () => {
  const external = externalIPv4();
  const cli = spawnCli(["--port", "0", "--host", "0.0.0.0"], undefined);
  try {
    const { port, host } = await cli.listening;
    expect(await selectOne(external, port)).toBe(1);
    expect(host).toBe("0.0.0.0");
  } finally {
    await stopCli(cli);
  }
});

test("CLI PGLITE_HOST applies when --host is absent", async () => {
  const external = externalIPv4();
  const cli = spawnCli(["--port", "0"], "0.0.0.0");
  try {
    const { port, host } = await cli.listening;
    expect(await selectOne(external, port)).toBe(1);
    expect(host).toBe("0.0.0.0");
  } finally {
    await stopCli(cli);
  }
});

test("CLI --host wins over PGLITE_HOST", async () => {
  const external = externalIPv4();
  const cli = spawnCli(["--port", "0", "--host", "0.0.0.0"], "127.0.0.1");
  try {
    const { port, host } = await cli.listening;
    expect(await selectOne(external, port)).toBe(1);
    expect(host).toBe("0.0.0.0");
  } finally {
    await stopCli(cli);
  }
});

test("CLI without --host or PGLITE_HOST stays on loopback", async () => {
  const external = externalIPv4();
  const cli = spawnCli(["--port", "0"], undefined);
  try {
    const { port, host } = await cli.listening;
    expect(await tcpProbe(external, port)).toBe("ECONNREFUSED");
    expect(host).toBe("127.0.0.1");
  } finally {
    await stopCli(cli);
  }
});

test("CLI --host without an address exits non-zero and names the flag", async () => {
  for (const cliArgs of [["--port", "0", "--host"], ["--host", "--port", "0"]]) {
    // PGLITE_HOST is set so that falling back to it, instead of failing, is caught too.
    const cli = spawnCli(cliArgs, "127.0.0.1");
    try {
      const exited = cli.child.exited.then((code) => ({ exitCode: code }));
      // Whichever comes first: the start-up line (a wrong outcome) or the exit.
      // `listening` rejects only after the exit, so that case yields the exit too.
      const outcome = await Promise.race([
        exited,
        cli.listening.then((listening) => ({ listening }), () => exited),
      ]);
      expect(outcome, cliArgs.join(" ")).toHaveProperty("exitCode");
      expect((outcome as { exitCode: number }).exitCode, cliArgs.join(" ")).not.toBe(0);
      expect(await cli.stderr, cliArgs.join(" ")).toContain("--host");
    } finally {
      await stopCli(cli);
    }
  }
});
