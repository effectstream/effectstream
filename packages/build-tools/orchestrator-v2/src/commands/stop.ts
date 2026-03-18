import type { ParsedArgs } from "../cli.ts";
import type { ProcessConfig } from "../config.ts";
import { OrchestratorClient } from "../api-client.ts";
import { loadConfig, findDefaultConfig } from "../load-config.ts";
import { pidsByPort, freePort } from "../port-check.ts";
import { logInfo, logError, logWarn } from "../display.ts";

type StopOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

export async function runStopCommand(opts: StopOptions): Promise<void> {
  const name = opts.positionals[0]; // optional

  const client = new OrchestratorClient(opts.port);

  // If the daemon is running, delegate to it
  if (await client.isRunning()) {
    if (name) {
      logInfo(`Stopping "${name}"…`);
      const result = await client.stop(name);
      if (result.error) {
        logError(result.error);
        process.exit(1);
      }
      logInfo(`"${name}" stopped.`);
    } else {
      logWarn("Stopping all processes and shutting down the orchestrator…");
      await client.shutdown();
      logInfo("Shutdown signal sent.");
    }
    return;
  }

  // No daemon — fall back to port-based kill
  logWarn("No orchestrator daemon detected — killing processes by port.");

  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[1] ??
    (await findDefaultConfig());

  if (!configPath) {
    logError("No config file found. Cannot determine which ports to free.");
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

  // If a name is given, only kill that process's ports
  if (name) {
    const proc = configs.find((c) => c.name === name);
    if (!proc) {
      logError(`Process "${name}" not found in config.`);
      process.exit(1);
    }
    const ports = proc.stopProcessAtPort ?? [];
    if (ports.length === 0) {
      logWarn(`Process "${name}" has no ports defined — nothing to kill.`);
      return;
    }
    for (const port of ports) {
      const pids = pidsByPort(port);
      if (pids.length > 0) {
        logInfo(`Killing PID ${pids.join(", ")} on port ${port} (${name})`);
        await freePort(port);
      }
    }
    logInfo(`"${name}" stopped.`);
    return;
  }

  // Kill all processes that have ports defined
  let killed = 0;
  for (const proc of configs) {
    for (const port of proc.stopProcessAtPort ?? []) {
      const pids = pidsByPort(port);
      if (pids.length > 0) {
        logInfo(`Killing PID ${pids.join(", ")} on port ${port} (${proc.name})`);
        await freePort(port);
        killed++;
      }
    }
  }

  if (killed === 0) {
    logInfo("No processes found on any configured ports.");
  } else {
    logInfo(`Stopped ${killed} process(es).`);
  }
}
