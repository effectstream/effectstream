#!/usr/bin/env -S deno run -A
/**
 * Runs database startup and pgtyped generation concurrently
 */

import { dirname, join } from "jsr:@std/path@1.1.1";

const __dirname = dirname(import.meta.url.replace("file://", ""));

interface ProcessInfo {
  name: string;
  command: string;
  args: string[];
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

  const command = new Deno.Command(processInfo.command, {
    args: processInfo.args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Handle stdout
  const stdoutReader = process.stdout.getReader();
  const stderrReader = process.stderr.getReader();

  // Stream stdout
  const stdoutPromise = (async () => {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        const text = decoder.decode(value);
        // Print each line with prefix
        text.split("\n").forEach((line) => {
          if (line.trim()) {
            console.log(`${prefix}${line}`);
          }
        });
      }
    } finally {
      stdoutReader.releaseLock();
    }
  })();

  // Stream stderr
  const stderrPromise = (async () => {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        const text = decoder.decode(value);
        // Print each line with prefix
        text.split("\n").forEach((line) => {
          if (line.trim()) {
            console.error(`${prefix}${line}`);
          }
        });
      }
    } finally {
      stderrReader.releaseLock();
    }
  })();

  // Wait for process to complete
  const [status] = await Promise.all([
    process.status,
    stdoutPromise,
    stderrPromise,
  ]);

  if (status.success) {
    console.log(`${prefix}✅ Completed successfully`);
  } else {
    console.error(`${prefix}❌ Failed with exit code ${status.code}`);
    throw new Error(`Process ${processInfo.name} failed`);
  }
}

async function main() {
  const processes: ProcessInfo[] = [
    {
      name: "db:up",
      command: "deno",
      args: ["run", "-A", join(__dirname, "start-pglite.ts")],
    },
    {
      name: "pgtyped:internal",
      command: "deno",
      args: ["run", "-A", join(__dirname, "pgtyped-internal.ts")],
    },
  ];

  console.log("🚀 Starting concurrent processes...\n");

  try {
    // Start all processes concurrently
    const promises = processes.map((p) => runProcess(p));
    await Promise.all(promises);
    console.log("\n✅ All processes completed successfully");
  } catch (error) {
    console.error("\n❌ One or more processes failed:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
