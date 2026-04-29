#!/usr/bin/env bun
/**
 * orchestrator CLI
 *
 * Commands:
 *   start   [config]  Start processes (runs as daemon, exposes HTTP API)
 *   status            Show process status (via daemon or port checks)
 *   restart <name>    Restart a named process
 *   stop    [name]    Stop a named process, or all processes
 *   list    [config]  List processes defined in a config without starting them
 *   silence [name...] Suppress terminal output for processes
 *   unsilence <name...> Resume terminal output for processes
 *   logs    [name...] Follow background daemon log files
 *
 * Global options:
 *   --port <n>        Orchestrator API port (default: 4747)
 *   --help, -h        Print help
 */

import { runStartCommand } from "./commands/start.ts";
import { runStatusCommand } from "./commands/status.ts";
import { runRestartCommand } from "./commands/restart.ts";
import { runStopCommand } from "./commands/stop.ts";
import { runListCommand } from "./commands/list.ts";
import { runSilenceCommand } from "./commands/silence.ts";
import { runLogsCommand } from "./commands/logs.ts";

// ── Minimal arg parser ────────────────────────────────────────────────────────

export type ParsedArgs = {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
};

const SHORT_TO_LONG: Record<string, string> = {
  b: "background",
  c: "config",
  e: "except",
  f: "follow",
  h: "help",
  o: "only",
  p: "port",
  s: "serial",
};

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = SHORT_TO_LONG[arg.slice(1)] ?? arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
    i++;
  }
  const [command = "", ...rest] = positionals;
  return { command, positionals: rest, flags };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const { command, positionals, flags } = parseArgs(process.argv.slice(2));

if (!command || flags["help"]) {
  printHelp();
  process.exit(0);
}

const port = flags["port"] ? Number(flags["port"]) : undefined;

try {
  switch (command) {
    case "start":
      await runStartCommand({ positionals, flags, port });
      break;

    case "status":
      await runStatusCommand({ positionals, flags, port });
      break;

    case "restart":
      await runRestartCommand({ positionals, flags, port });
      break;

    case "stop":
      await runStopCommand({ positionals, flags, port });
      break;

    case "list":
      await runListCommand({ positionals, flags });
      break;

    case "silence":
      await runSilenceCommand({ positionals, flags, port });
      break;

    case "unsilence":
      await runSilenceCommand({ positionals, flags: { ...flags, unsilence: true }, port });
      break;

    case "logs":
      await runLogsCommand({ positionals, flags });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} catch (err: any) {
  console.error(`\x1b[31mError:\x1b[0m ${err?.message ?? err}`);
  process.exit(1);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`\x1b[1morchestrator\x1b[0m — Bun-based process orchestration CLI

\x1b[1mUsage:\x1b[0m
  orchestrator <command> [options]

\x1b[1mCommands:\x1b[0m
  start   [config|name...]    Start all processes, or specific ones by name
  status                      Show status of running processes
  restart <name>              Restart a specific process by name
  stop    [name]              Stop a specific process (or all if no name given)
  list    [config]            List processes in config without starting them
  silence [name...]           Suppress terminal output for processes (no args = show list)
  unsilence <name...>         Resume terminal output for processes
  logs    [name...]           Follow background daemon log files (like tail -f)

\x1b[1mGlobal options:\x1b[0m
  -c, --config  <path>        Config file (default: auto-detected from daemon, package.json, or orchestrator.config.ts)
  -h, --help                  Print help

\x1b[1mOptions for \`start\`:\x1b[0m
  -b, --background            Run as a detached background daemon; logs go to files
  -p, --port    <n>           Orchestrator API port (default: 4747)
  -o, --only    <p1,p2,...>   Run only these processes (+ their dependencies)
  -e, --except  <p1,p2,...>   Skip these processes
  -s, --serial                Launch processes one at a time instead of in parallel waves
  --no-deps                   Launch only named processes, skip dependency resolution
  --log-dir     <path>        Log directory when using -b (default: .orchestrator-logs)
  --no-api                    Disable the HTTP API server
  --silence     <p1,p2,...>   Suppress terminal output for these processes

\x1b[1mOptions for \`status\`:\x1b[0m
  -f, --follow                Continuously refresh the status table (1s interval)

\x1b[1mExamples:\x1b[0m
  orchestrator start orchestrator.config.ts
  orchestrator start hardhat
  orchestrator start hardhat deploy-evm-contracts
  orchestrator start --only=midnight-node,midnight-indexer
  orchestrator start --except=avail-client
  orchestrator status
  orchestrator restart midnight-node
  orchestrator stop batcher
  orchestrator start --silence=midnight-node,bitcoin-core
  orchestrator silence midnight-node bitcoin-core
  orchestrator unsilence midnight-node
  orchestrator list orchestrator.config.ts
`);
}
