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
  // callers would otherwise report clients as though they owned the port.
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      stderr: "pipe",
    });
  } catch {
    // Minimal containers and Windows may not provide lsof. Port occupancy is
    // still authoritative; diagnostics explicitly report an unavailable PID.
    return [];
  }
  if (result.exitCode !== 0) return [];
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

export type PortListener = {
  port: number;
  pids: number[];
};

/** Inspects configured ports without ever signaling their listeners. */
export async function inspectPorts(ports: number[]): Promise<PortListener[]> {
  const listeners: PortListener[] = [];
  for (const port of [...new Set(ports)]) {
    if (await isPortInUse(port)) listeners.push({ port, pids: pidsByPort(port) });
  }
  return listeners;
}

export function describePortListener(listener: PortListener): string {
  const owners = listener.pids.length === 0
    ? "listener PID unavailable"
    : `PID ${listener.pids.join(", ")}`;
  return `port ${listener.port} (${owners})`;
}

export class PortConflictError extends Error {
  constructor(readonly listeners: PortListener[]) {
    super(
      `Refusing to start: ${listeners.map(describePortListener).join("; ")} already occupied. ` +
      "Stop the owning service explicitly or choose another port; the orchestrator will not signal an unowned listener.",
    );
    this.name = "PortConflictError";
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
