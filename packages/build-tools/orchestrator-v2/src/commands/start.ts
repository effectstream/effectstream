import * as fs from "fs";
import * as path from "path";
import type { ParsedArgs } from "../cli.ts";
import { OrchestratorClient } from "../api-client.ts";
import { ProcessManager } from "../process-manager.ts";
import { runProcesses } from "../task-runner.ts";
import { startApiServer } from "../api-server.ts";
import {
  writeStatePort,
  clearStatePort,
  freePort,
  DEFAULT_API_PORT,
} from "../port-check.ts";
import {
  logTaskStart,
  logTaskRunning,
  logTaskDone,
  logTaskFailed,
  logInfo,
  logWarn,
  logError,
} from "../display.ts";
import { loadConfig, findDefaultConfig } from "../load-config.ts";

type StartOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

/** Resolve and load the orchestrator config file. */
async function resolveConfig(opts: StartOptions) {
  // Only use positional[0] as config path if it looks like a file path
  const positionalConfig = opts.positionals[0]?.includes(".") || opts.positionals[0]?.includes("/")
    ? opts.positionals[0]
    : undefined;

  const configPath =
    (opts.flags["config"] as string | undefined) ??
    positionalConfig ??
    (await findDefaultConfig()) ??
    (() => {
      throw new Error(
        "No config file found. Pass one as an argument or create orchestrator.config.ts.",
      );
    })();

  logInfo(`Loading config: ${configPath}`);
  return { configPath, config: await loadConfig(configPath) };
}

/** Parse --only and --except flags into arrays. */
function parseFilters(flags: Record<string, string | boolean>) {
  const only =
    typeof flags["only"] === "string"
      ? flags["only"].split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  const except =
    typeof flags["except"] === "string"
      ? flags["except"].split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  return { only, except };
}

export async function runStartCommand(opts: StartOptions): Promise<void> {
  // ── Background mode ────────────────────────────────────────────────────────
  if (opts.flags["background"] === true) {
    await spawnBackground(opts);
    return;
  }

  // ── Resolve config ─────────────────────────────────────────────────────────
  const { config } = await resolveConfig(opts);
  let { only, except } = parseFilters(opts.flags);

  // Treat positional args as process names (shorthand for --only)
  // e.g. `start hardhat` is the same as `start --only=hardhat`
  if (!only && opts.positionals.length > 0) {
    const processNames = new Set(config.processes.map((p) => p.name));
    const names = opts.positionals.filter((p) => processNames.has(p));
    if (names.length > 0) {
      only = names;
    }
  }

  // ── API port ───────────────────────────────────────────────────────────────
  const apiPort =
    opts.port ??
    (typeof opts.flags["port"] === "string" ? Number(opts.flags["port"]) : undefined) ??
    config.apiPort ??
    DEFAULT_API_PORT;

  const noApi = opts.flags["no-api"] === true;
  const serial = opts.flags["serial"] === true;
  const noDeps = opts.flags["no-deps"] === true;
  const silenceFlag =
    typeof opts.flags["silence"] === "string"
      ? opts.flags["silence"].split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  // ── Check for existing daemon ──────────────────────────────────────────────
  // If an orchestrator daemon is already running, delegate to it via API.
  if (!noApi) {
    const client = new OrchestratorClient(apiPort);
    if (await client.isRunning()) {
      logInfo(`Orchestrator daemon already running on port ${apiPort} — delegating via API`);

      if (only)   logInfo(`Running only: ${only.join(", ")}`);
      if (except)  logInfo(`Skipping: ${except.join(", ")}`);

      const result = await client.start(config.processes, { only, except, serial, noDeps });
      if (result.success) {
        logInfo(`Queued processes: ${result.queued?.join(", ") ?? "none"}`);
      } else {
        logError(`Failed to start via API: ${result.error}`);
      }
      return;
    }
  }

  // ── Per-process log directory (set by --background re-spawn) ──────────────
  const logDirFlag = opts.flags["log-dir"] as string | undefined;
  if (logDirFlag) fs.mkdirSync(logDirFlag, { recursive: true });

  // ── Process manager ────────────────────────────────────────────────────────
  const manager = new ProcessManager();
  if (logDirFlag) manager.logDir = logDirFlag;
  if (silenceFlag) {
    for (const name of silenceFlag) manager.silence(name);
  }

  // ── Task event callbacks (shared between local runs and API-triggered runs)
  const runCallbacks = {
    onTaskStart: (name: string, logFile: string | null) => logTaskStart(name, logFile ?? undefined),
    onTaskRunning: logTaskRunning,
    onTaskDone: logTaskDone,
    onTaskFailed: logTaskFailed,
    onShutdown: undefined as ((reason: string) => void) | undefined,
  };

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  let shuttingDown = false;
  let apiServer: ReturnType<typeof startApiServer> | undefined;

  const shutdown = async (reason?: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (reason) logWarn(`Shutting down: ${reason}`);
    else logInfo("Shutting down…");
    apiServer?.stop(true);
    await manager.stopAll();

    // Kill any orphan processes still occupying configured ports
    for (const proc of config.processes) {
      for (const port of proc.stopProcessAtPort ?? []) {
        await freePort(port);
      }
    }

    clearStatePort();
    process.exit(reason ? 1 : 0);
  };

  runCallbacks.onShutdown = shutdown;

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // ── API server ─────────────────────────────────────────────────────────────
  if (!noApi) {
    try {
      apiServer = startApiServer({
        port: apiPort,
        manager,
        onShutdown: () => shutdown("shutdown API request"),
        runCallbacks,
      });
      writeStatePort(apiPort);
      logInfo(`API server listening on http://localhost:${apiPort}`);
    } catch (err: any) {
      logWarn(`Could not start API server on port ${apiPort}: ${err.message}`);
    }
  }

  // ── Launch ─────────────────────────────────────────────────────────────────
  if (only)   logInfo(`Running only: ${only.join(", ")}`);
  if (except) logInfo(`Skipping: ${except.join(", ")}`);
  if (serial) logInfo("Serial mode: launching processes one at a time");
  if (noDeps) logInfo("No-deps mode: skipping dependency resolution");

  try {
    await runProcesses(config.processes, manager, {
      only,
      except,
      serial,
      noDeps,
      ...runCallbacks,
    });
  } catch (err: any) {
    logError(err.message);
    await shutdown(err.message);
    return;
  }

  // If no background processes remain (all were waitToExit) and no API server,
  // exit cleanly instead of hanging forever.
  const hasBackground = manager.getAll().some(p => p.status === "running");
  if (!hasBackground && noApi) {
    logInfo("All processes completed. Exiting.");
    process.exit(0);
  }

  logInfo("All processes launched. Orchestrator is running. Press Ctrl+C to stop.");
}

// ── Background helper ─────────────────────────────────────────────────────────

async function spawnBackground(opts: StartOptions): Promise<void> {
  const apiPort =
    opts.port ??
    (typeof opts.flags["port"] === "string" ? Number(opts.flags["port"]) : undefined) ??
    DEFAULT_API_PORT;

  const client = new OrchestratorClient(apiPort);
  if (await client.isRunning()) {
    const col = { reset: "\x1b[0m", bold: "\x1b[1m", red: "\x1b[31m", dim: "\x1b[2m", cyan: "\x1b[36m" };
    const cliPath = path.resolve(import.meta.dir, "../cli.ts");
    console.error(`\n${col.red}${col.bold}An orchestrator daemon is already running on port ${apiPort}.${col.reset}\n`);
    console.error(`${col.dim}Check status:${col.reset}    bun ${cliPath} status`);
    console.error(`${col.dim}View logs:${col.reset}       bun ${cliPath} logs`);
    console.error(`${col.dim}Stop it:${col.reset}         bun ${cliPath} stop`);
    console.error();
    process.exit(1);
  }

  const configPath =
    (opts.flags["config"] as string | undefined) ??
    opts.positionals[0] ??
    (await findDefaultConfig()) ??
    (() => {
      throw new Error(
        "No config file found. Pass one as an argument or create orchestrator.config.ts.",
      );
    })();

  // Default log dir: <cwd>/.orchestrator-logs
  const logDir = path.resolve(
    (opts.flags["log-dir"] as string | undefined) ??
      path.join(process.cwd(), ".orchestrator-logs"),
  );
  fs.mkdirSync(logDir, { recursive: true });

  const orchLogPath = path.join(logDir, "orchestrator.log");

  // Build daemon args: same start command without --background, plus --log-dir
  const daemonArgs: string[] = ["start", configPath, `--log-dir=${logDir}`];
  if (opts.flags["only"])   daemonArgs.push(`--only=${opts.flags["only"]}`);
  if (opts.flags["except"]) daemonArgs.push(`--except=${opts.flags["except"]}`);
  if (opts.flags["port"])   daemonArgs.push(`--port=${opts.flags["port"]}`);
  if (opts.flags["no-api"]) daemonArgs.push("--no-api");
  if (opts.flags["serial"]) daemonArgs.push("--serial");
  if (opts.flags["no-deps"]) daemonArgs.push("--no-deps");

  // Open orchestrator log in write mode (fresh on each background start)
  const orchFd = fs.openSync(orchLogPath, "w");

  const cliPath = path.resolve(import.meta.dir, "../cli.ts");
  const daemon = Bun.spawn(["bun", cliPath, ...daemonArgs], {
    stdout: orchFd,
    stderr: orchFd,
    stdin: "ignore",
    detached: true,
  });
  fs.closeSync(orchFd);
  daemon.unref();

  // Print summary
  const col = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", dim: "\x1b[2m" };
  console.log(`\n${col.bold}Orchestrator started in background${col.reset}  (PID ${daemon.pid})\n`);
  console.log(`${col.bold}Log directory:${col.reset}  ${col.cyan}${logDir}${col.reset}`);
  console.log(`  ${col.dim}orchestrator:${col.reset}  ${orchLogPath}`);
  console.log(`  ${col.dim}processes:${col.reset}     ${logDir}/<process-name>.log\n`);
  console.log(`${col.dim}Tail all logs:${col.reset}   tail -f ${logDir}/*.log`);
  console.log(`${col.dim}Check status:${col.reset}    bun ${cliPath} status`);
  console.log(`${col.dim}Stop all:${col.reset}        bun ${cliPath} stop\n`);
}
