import type { ParsedArgs } from "../cli.ts";
import { OrchestratorClient, type RemoteProcess } from "../api-client.ts";
import { printStatusTable, type StatusRow, logError, logWarn } from "../display.ts";
import { findDefaultConfig, findPackageJsonConfig, loadConfig } from "../load-config.ts";
import { isPortInUse, pidsByPort, readStateConfigPath } from "../port-check.ts";
import type { ProcessConfig } from "../config.ts";

type StatusOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

async function fetchStatus(
  opts: StatusOptions,
  configs: ProcessConfig[],
): Promise<{ rows: StatusRow[]; daemonRunning: boolean }> {
  const client = new OrchestratorClient(opts.port);
  const daemonRunning = await client.isRunning();
  const daemonProcesses = daemonRunning ? await client.getProcesses() : [];
  const daemonMap = new Map(daemonProcesses.map((p) => [p.name, p]));

  const untracked = configs.filter((c) => !daemonMap.has(c.name));
  const portResults = await Promise.all(
    untracked.map(async (c) => {
      const ports = c.stopProcessAtPort ?? [];
      if (ports.length === 0) return { name: c.name, portStatus: "no-ports" as const, pid: undefined };
      const results = await Promise.all(ports.map((p) => isPortInUse(p)));
      const allUp = results.every(Boolean);
      const someUp = results.some(Boolean);
      const portStatus = allUp ? "up" : someUp ? "partial" : ("down" as const);
      const firstUpIdx = results.findIndex(Boolean);
      const pid = firstUpIdx >= 0 ? (pidsByPort(ports[firstUpIdx])[0] ?? undefined) : undefined;
      return { name: c.name, portStatus, pid };
    }),
  );
  const portMap = new Map(portResults.map((r) => [r.name, r]));

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

  const rows: StatusRow[] = configs.map((c) => {
    const daemon = daemonMap.get(c.name);
    if (daemon) return { source: "daemon" as const, config: c, daemon, actualPid: daemonPidMap.get(c.name) };
    const { portStatus, pid } = portMap.get(c.name)!;
    return { source: "port" as const, config: c, portStatus, pid };
  });

  return { rows, daemonRunning };
}

export async function runStatusCommand(opts: StatusOptions): Promise<void> {
  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[0] ??
    readStateConfigPath() ??
    (await findPackageJsonConfig()) ??
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

  const follow = opts.flags["follow"] === true;

  if (!follow) {
    const { rows, daemonRunning } = await fetchStatus(opts, configs);
    if (!daemonRunning) {
      logWarn("No orchestrator daemon detected — showing port-based status.");
    }
    printStatusTable(rows, daemonRunning);
    return;
  }

  // Follow mode: refresh every second
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  let firstRender = true;
  while (true) {
    process.stdout.write("\x1b[H");
    const { rows, daemonRunning } = await fetchStatus(opts, configs);
    if (!daemonRunning && firstRender) {
      logWarn("No orchestrator daemon detected — showing port-based status.");
    }
    printStatusTable(rows, daemonRunning);
    process.stdout.write("\x1b[J");
    firstRender = false;
    await Bun.sleep(1000);
  }
}
