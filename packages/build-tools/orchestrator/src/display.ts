import * as path from "path";
import type { RemoteProcess } from "./api-client.ts";
import type { ProcessConfig } from "./config.ts";

// ANSI colour helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  const len = stripAnsi(s).length;
  const pad = Math.max(0, width - len);
  return align === "left" ? s + " ".repeat(pad) : " ".repeat(pad) + s;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function colorStatus(status: string, waitToExit?: boolean): string {
  switch (status) {
    case "running":
      // Distinguish background services from tasks that will exit
      if (waitToExit) return `${c.yellow}running…${c.reset}`;
      return `${c.green}${status}${c.reset}`;
    case "done":
      return `${c.blue}${status}${c.reset}`;
    case "failed":
      return `${c.red}${status}${c.reset}`;
    case "stopped":
      return `${c.yellow}${status}${c.reset}`;
    case "pending":
      return `${c.gray}${status}${c.reset}`;
    default:
      return status;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return c.gray + "—" + c.reset;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export type StatusRow =
  | { source: "daemon"; config: ProcessConfig; daemon: RemoteProcess; actualPid?: number }
  | { source: "port"; config: ProcessConfig; portStatus: "up" | "partial" | "down" | "no-ports"; pid?: number };

/**
 * Unified status table. Shows every process from the config in order.
 * Processes tracked by the daemon show live data; others show port-based status.
 */
export function printStatusTable(rows: StatusRow[], daemonRunning: boolean): void {
  const hasLogFiles = rows.some(
    (r) => r.source === "daemon" && r.daemon.logFile,
  );

  const cols = { name: 28, status: 10, pid: 8, ports: 18, started: 12 };
  const tailLabel = hasLogFiles ? "LOG" : "LINK";

  const header =
    c.bold +
    pad("NAME", cols.name) +
    "  " +
    pad("STATUS", cols.status) +
    "  " +
    pad("PID", cols.pid, "right") +
    "  " +
    pad("PORTS", cols.ports) +
    "  " +
    pad("STARTED", cols.started) +
    "  " +
    tailLabel +
    c.reset;

  const sep = c.dim + "─".repeat(110) + c.reset;

  console.log(header);
  console.log(sep);

  for (const row of rows) {
    const portList = (row.config.stopProcessAtPort ?? []).join(", ");
    const ports = portList || c.gray + "—" + c.reset;
    const nameLabel = row.config.name + (row.config.autoStart === false ? ` ${c.dim}*${c.reset}` : "");

    if (row.source === "daemon") {
      const { daemon: d } = row;
      const pidVal = row.actualPid ?? d.pid;
      const pid = pidVal != null ? String(pidVal) : c.gray + "—" + c.reset;
      const relLog = d.logFile ? path.relative(process.cwd(), d.logFile) || "." : null;
      const tail = hasLogFiles
        ? relLog ? `${c.dim}${relLog}${c.reset}` : ""
        : d.link ? `${c.cyan}${d.link}${c.reset}` : "";

      console.log(
        pad(nameLabel, cols.name) +
          "  " +
          pad(colorStatus(d.status, row.config.waitToExit), cols.status) +
          "  " +
          pad(pid, cols.pid, "right") +
          "  " +
          pad(ports, cols.ports) +
          "  " +
          pad(relativeTime(d.startedAt), cols.started) +
          "  " +
          tail,
      );
    } else {
      const dash = c.gray + "—" + c.reset;
      const status = colorPortStatus(row.portStatus);
      const pid = row.pid != null ? String(row.pid) : dash;
      console.log(
        pad(nameLabel, cols.name) +
          "  " +
          pad(status, cols.status) +
          "  " +
          pad(pid, cols.pid, "right") +
          "  " +
          pad(ports, cols.ports) +
          "  " +
          pad(dash, cols.started) +
          "  " +
          (row.config.link ? `${c.cyan}${row.config.link}${c.reset}` : ""),
      );
    }
  }

  const hasManual = rows.some((r) => r.config.autoStart === false);
  if (hasManual) {
    console.log(`\n${c.dim}* manual — only runs via --only, not during default start${c.reset}`);
  }

  if (!daemonRunning) {
    console.log(
      `\n${c.dim}(no daemon — port-based status only; start with: orchestrator start)${c.reset}`,
    );
  }
}

function colorPortStatus(s: "up" | "partial" | "down" | "no-ports"): string {
  switch (s) {
    case "up":      return `${c.green}up${c.reset}`;
    case "partial": return `${c.yellow}partial${c.reset}`;
    case "down":    return `${c.red}down${c.reset}`;
    case "no-ports": return `${c.gray}—${c.reset}`;
  }
}

/**
 * Prints a start event line to the terminal.
 */
export function logTaskStart(name: string, logFile?: string): void {
  const suffix = logFile ? `  ${c.dim}→ ${logFile}${c.reset}` : "";
  console.log(`${c.green}▶${c.reset} ${c.bold}${name}${c.reset}${suffix}`);
}

export function logTaskRunning(name: string): void {
  console.log(`${c.blue}●${c.reset} ${c.bold}${name}${c.reset} ${c.dim}running in background${c.reset}`);
}

export function logTaskDone(name: string): void {
  console.log(`${c.blue}✓${c.reset} ${c.bold}${name}${c.reset} ${c.dim}exited successfully${c.reset}`);
}

export function logTaskFailed(name: string, code: number): void {
  console.error(`${c.red}✗${c.reset} ${c.bold}${name}${c.reset} ${c.red}exited with code ${code}${c.reset}`);
}

export function logInfo(msg: string): void {
  console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
}

export function logError(msg: string): void {
  console.error(`${c.red}✗${c.reset} ${msg}`);
}

export function logWarn(msg: string): void {
  console.warn(`${c.yellow}⚠${c.reset} ${msg}`);
}

export function logWaitingForExit(names: string[]): void {
  const list = names.join(", ");
  console.log(
    `${c.gray}…${c.reset} ${c.dim}waiting on${c.reset} ${c.bold}${list}${c.reset}` +
      `${c.dim}  (see logs/*.log — often midnight-indexer-wait or midnight-contract)${c.reset}`,
  );
}
