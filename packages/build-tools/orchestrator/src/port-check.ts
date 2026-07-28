import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

/** Returns true if something is accepting connections on `port`. */
export function isPortInUse(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

/** Polls until the port is in use or the timeout elapses. Returns true if port came up. */
export async function waitForPort(port: number, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortInUse(port)) return true;
    await Bun.sleep(500);
  }
  return false;
}

/**
 * Returns the PID(s) of processes listening on `port`, or an empty array if none.
 * Uses `lsof -ti tcp:<port>` (macOS / Linux).
 */
export function pidsByPort(port: number): number[] {
  // `-sTCP:LISTEN` restricts to the process LISTENING on the port. Without it,
  // `lsof -ti tcp:<port>` also returns CLIENTS with an open connection to the
  // port (e.g. a test harness holding a keepalive fetch to the sync API), which
  // callers like freePort() would then wrongly SIGTERM.
  const result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    stderr: "pipe",
  });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

/**
 * Kills any process occupying `port` via SIGTERM, then waits for the port to free.
 * Uses `lsof` (macOS / Linux).
 */
export async function freePort(port: number): Promise<void> {
  if (!(await isPortInUse(port))) return;

  // `-sTCP:LISTEN` so we only kill the listener, never a client connected to
  // the port (see pidsByPort). During shutdown a template's test process often
  // holds an open connection to the sync API / chain ports; without this filter
  // freePort would SIGTERM the test process (and its `bun run test` wrapper),
  // failing an otherwise-green run with exit 143.
  const result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    stderr: "pipe",
  });

  if (result.exitCode === 0) {
    const pids = result.stdout
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const pid of pids) {
      Bun.spawnSync(["kill", "-TERM", pid.trim()]);
    }

    // Wait up to 5 seconds for the port to free
    let tries = 20;
    while (tries-- > 0) {
      if (!(await isPortInUse(port))) return;
      await Bun.sleep(250);
    }

    // Fall back to SIGKILL
    for (const pid of pids) {
      Bun.spawnSync(["kill", "-KILL", pid.trim()]);
    }
  }
}

// ---------------------------------------------------------------------------
// State file: records the API port of the running daemon so CLI commands can
// discover it without requiring the user to pass --port every time.
// ---------------------------------------------------------------------------

const STATE_FILE = path.join(os.tmpdir(), ".orchestrator.port");

export const DEFAULT_API_PORT = 4747;

export function writeState(port: number, configPath: string): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ port, configPath }), "utf8");
}

export function readStatePort(): number | null {
  try {
    const text = fs.readFileSync(STATE_FILE, "utf8").trim();
    if (text.startsWith("{")) {
      const data = JSON.parse(text);
      return typeof data.port === "number" ? data.port : null;
    }
    const n = parseInt(text, 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export function readStateConfigPath(): string | null {
  try {
    const text = fs.readFileSync(STATE_FILE, "utf8").trim();
    if (text.startsWith("{")) {
      const data = JSON.parse(text);
      return typeof data.configPath === "string" ? data.configPath : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearStatePort(): void {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // ignore
  }
}
