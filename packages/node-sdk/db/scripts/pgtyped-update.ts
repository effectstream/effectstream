#!/usr/bin/env node
/**
 * Runs database startup and pgtyped generation concurrently
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ProcessInfo {
  name: string;
  command: string;
  args: string[];
  wait: boolean;
}

async function streamLines(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream) return;
  const rl = createInterface({ input: stream });
  rl.on("line", onLine);
  await once(rl, "close");
}

function createPrefix(name: string): string {
  const colors = {
    "db:up": "\x1b[36m", // cyan
    "pgtyped:internal": "\x1b[33m", // yellow
  };
  const reset = "\x1b[0m";
  const color = colors[name as keyof typeof colors] || "\x1b[37m"; // white
  return `${color}[${name}]${reset} `;
}

async function runProcess(processInfo: ProcessInfo): Promise<void> {
  const prefix = createPrefix(processInfo.name);

  console.log(`${prefix}Starting...`);

  const child = spawn(processInfo.command, processInfo.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutPromise = streamLines(child.stdout, (line) => {
    if (line.trim()) {
      console.log(`${prefix}${line}`);
    }
  });

  const stderrPromise = streamLines(child.stderr, (line) => {
    if (line.trim()) {
      console.error(`${prefix}${line}`);
    }
  });

  if (processInfo.wait) {
    // Wait for process to complete
    const [status] = await Promise.all([
      once(child, "exit").then(([code]) => ({ code })),
      stdoutPromise,
      stderrPromise,
    ]);

    if (status.code === 0) {
      console.log(`${prefix}✅ Completed successfully`);
    } else {
      console.error(`${prefix}❌ Failed with exit code ${status.code ?? "unknown"}`);
      throw new Error(`Process ${processInfo.name} failed`);
    }
  }
}

async function main() {
  const processes: ProcessInfo[] = [
    {
      name: "db:up",
      command: "deno",
      args: ["run", "-A", join(__dirname, "start-pglite.ts")],
      wait: false,
    },
    {
      name: "db:wait",
      command: "deno",
      args: ["run", "-A", join(__dirname, "wait-for-db.ts")],
      wait: true,
    },
    {
      name: "apply-migrations",
      command: "deno",
      args: ["run", "-A", join(__dirname, "apply-migrations.ts")],
      wait: true,
    },
    {
      name: "pgtyped",
      command: "npx",
      args: ["pgtyped", "-c", "./pgtypedconfig.json"],
      wait: true,
    },
  ];

  console.log("🚀 Starting concurrent processes...\n");

  try {
    for (const process of processes) {
      await runProcess(process);
    }
    console.log("\n✅ All processes completed successfully");
  } catch (error) {
    console.error("\n❌ One or more processes failed:", error);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("pgtyped-update.ts")) {
  await main();
}
