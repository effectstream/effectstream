import type { ParsedArgs } from "../cli.ts";
import { OrchestratorClient, type RemoteProcess } from "../api-client.ts";
import { printStatusTable, logError, logWarn } from "../display.ts";
import { findDefaultConfig, loadConfig } from "../load-config.ts";
import { isPortInUse, pidsByPort } from "../port-check.ts";
import type { ProcessConfig } from "../config.ts";

type StatusOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

export async function runStatusCommand(opts: StatusOptions): Promise<void> {
  // Always load the config so we can show every process, not just tracked ones
  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[0] ??
    (await findDefaultConfig());

  if (!configPath) {
    logError(
      "No config file found. Pass one with --config or create orchestrator.config.ts",
    );
    process.exit(1);
  }

  let configs: ProcessConfig[];
  try {
    const config = await loadConfig(configPath);
    configs = config.processes;
  } catch (err: any) {
    logError(err.message);
    process.exit(1);
  }

  // Try to get live data from the daemon
  const client = new OrchestratorClient(opts.port);
  const daemonRunning = await client.isRunning();
  const daemonProcesses = daemonRunning ? await client.getProcesses() : [];
  const daemonMap = new Map(daemonProcesses.map((p) => [p.name, p]));

  if (!daemonRunning) {
    logWarn("No orchestrator daemon detected — showing port-based status.");
  }

  // For processes not tracked by the daemon, check ports in parallel
  const untracked = configs.filter((c) => !daemonMap.has(c.name));
  const portResults = await Promise.all(
    untracked.map(async (c) => {
      const ports = c.stopProcessAtPort ?? [];
      if (ports.length === 0) return { name: c.name, portStatus: "no-ports" as const, pid: undefined };
      const results = await Promise.all(ports.map((p) => isPortInUse(p)));
      const allUp = results.every(Boolean);
      const someUp = results.some(Boolean);
      const portStatus = allUp ? "up" : someUp ? "partial" : ("down" as const);
      // Find the actual PID listening on the first up port
      const firstUpIdx = results.findIndex(Boolean);
      const pid = firstUpIdx >= 0 ? (pidsByPort(ports[firstUpIdx])[0] ?? undefined) : undefined;
      return { name: c.name, portStatus, pid };
    }),
  );
  const portMap = new Map(portResults.map((r) => [r.name, r]));

  // Look up actual PIDs for daemon-tracked processes via their ports
  const daemonPidMap = new Map<string, number | undefined>();
  await Promise.all(
    daemonProcesses.map(async (p) => {
      const cfg = configs.find((c) => c.name === p.name);
      const ports = cfg?.stopProcessAtPort ?? [];
      if (ports.length === 0) { daemonPidMap.set(p.name, undefined); return; }
      const up = await Promise.all(ports.map((port) => isPortInUse(port)));
      const firstUpIdx = up.findIndex(Boolean);
      const actualPid = firstUpIdx >= 0 ? (pidsByPort(ports[firstUpIdx])[0] ?? undefined) : undefined;
      daemonPidMap.set(p.name, actualPid);
    }),
  );

  // Build unified rows in config order
  const rows = configs.map((c) => {
    const daemon = daemonMap.get(c.name);
    if (daemon) return { source: "daemon" as const, config: c, daemon, actualPid: daemonPidMap.get(c.name) };
    const { portStatus, pid } = portMap.get(c.name)!;
    return { source: "port" as const, config: c, portStatus, pid };
  });

  printStatusTable(rows, daemonRunning);
}
