#!/usr/bin/env bun
/**
 * Runs database startup and pgtyped generation concurrently
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(import.meta.url?.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url.replace("file://", ""));

interface ProcessInfo {
  name: string;
  command: string;
  args: string[];
  wait: boolean;
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
    stdio: ["inherit", "pipe", "pipe"],
    shell: processInfo.command === "npx",
  });

  const stdoutPromise = new Promise<void>((resolve) => {
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      text.split("\n").forEach((line) => {
        if (line.trim()) console.log(`${prefix}${line}`);
      });
    });
    child.stdout?.on("end", resolve);
    if (!child.stdout) resolve();
  });

  const stderrPromise = new Promise<void>((resolve) => {
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      text.split("\n").forEach((line) => {
        if (line.trim()) console.error(`${prefix}${line}`);
      });
    });
    child.stderr?.on("end", resolve);
    if (!child.stderr) resolve();
  });

  const exitCode = new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
  });

  if (processInfo.wait) {
    const [code] = await Promise.all([exitCode, stdoutPromise, stderrPromise]);
    if (code === 0) {
      console.log(`${prefix}✅ Completed successfully`);
    } else {
      console.error(`${prefix}❌ Failed with exit code ${code}`);
      throw new Error(`Process ${processInfo.name} failed`);
    }
  }
}

async function main() {
  const processes: ProcessInfo[] = [
    {
      name: "db:up",
      command: "bun",
      args: ["run", join(__dirname, "start-pglite.ts")],
      wait: false,
    },
    {
      name: "db:wait",
      command: "bun",
      args: ["run", join(__dirname, "wait-for-db.ts")],
      wait: true,
    },
    {
      name: "apply-migrations",
      command: "bun",
      args: ["run", join(__dirname, "apply-migrations.ts")],
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

if (import.meta.main) {
  await main();
}
