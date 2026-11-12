import type { ParsedArgs } from "../cli.ts";
import type { ProcessConfig } from "../config.ts";
import { OrchestratorClient } from "../api-client.ts";
import { loadConfig, findDefaultConfig, findPackageJsonConfig } from "../load-config.ts";
import { describePortListener, inspectPorts, readStateConfigPath, type PortListener } from "../port-check.ts";
import { logInfo, logError, logWarn } from "../display.ts";

type StopOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

export type ConfiguredPortListener = PortListener & { processName: string };

/** Resolves configured listeners for diagnostics only; it has no signal path. */
export async function collectConfiguredPortListeners(
  configs: ProcessConfig[],
  name?: string,
): Promise<ConfiguredPortListener[]> {
  const selected = name ? configs.filter((config) => config.name === name) : configs;
  const configured = selected.flatMap((config) =>
    (config.stopProcessAtPort ?? []).map((port) => ({ processName: config.name, port })),
  );
  const inspected = await inspectPorts(configured.map(({ port }) => port));
  const byPort = new Map(inspected.map((listener) => [listener.port, listener]));
  return configured.flatMap(({ processName, port }) => {
    const listener = byPort.get(port);
    return listener ? [{ ...listener, processName }] : [];
  });
}

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

  // No daemon means there is no trusted live ownership record. Ports are
  // diagnostic only and must never become raw signal targets.
  logWarn("No orchestrator daemon detected — inspecting configured ports only.");

  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[1] ??
    readStateConfigPath() ??
    (await findPackageJsonConfig()) ??
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

  // If a name is given, only inspect that process's configured ports.
  if (name) {
    const proc = configs.find((c) => c.name === name);
    if (!proc) {
      logError(`Process "${name}" not found in config.`);
      process.exit(1);
    }
    const ports = proc.stopProcessAtPort ?? [];
    if (ports.length === 0) {
      logWarn(`Process "${name}" has no ports defined — nothing to inspect.`);
      return;
    }
    const listeners = await collectConfiguredPortListeners(configs, name);
    if (listeners.length === 0) {
      logInfo(`No configured listeners found for "${name}".`);
      return;
    }
    for (const listener of listeners) {
      logError(`Refusing to signal ${describePortListener(listener)} for "${name}" without a live ownership record.`);
    }
    process.exitCode = 1;
    return;
  }

  const listeners = await collectConfiguredPortListeners(configs);
  if (listeners.length === 0) {
    logInfo("No processes found on any configured ports.");
    return;
  }
  for (const listener of listeners) {
    logError(
      `Refusing to signal ${describePortListener(listener)} configured for "${listener.processName}" without a live ownership record.`,
    );
  }
  process.exitCode = 1;
}
