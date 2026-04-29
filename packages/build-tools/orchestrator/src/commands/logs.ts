import * as fs from "fs";
import * as path from "path";
import type { ParsedArgs } from "../cli.ts";

type LogsOptions = Pick<ParsedArgs, "positionals" | "flags">;

/**
 * `logs` command — tails all (or specific) background daemon log files.
 *
 *   orchestrator logs                   # follow all logs
 *   orchestrator logs sync batcher      # follow only sync.log and batcher.log
 *   orchestrator logs --log-dir=./logs  # custom log directory
 */
export async function runLogsCommand(opts: LogsOptions): Promise<void> {
  const logDir = path.resolve(
    (opts.flags["log-dir"] as string | undefined) ??
      path.join(process.cwd(), ".orchestrator-logs"),
  );

  if (!fs.existsSync(logDir)) {
    throw new Error(
      `Log directory not found: ${logDir}\nStart the orchestrator with --background first.`,
    );
  }

  // Determine which log files to follow
  const filterNames = opts.positionals.length > 0 ? opts.positionals : null;

  const allFiles = fs.readdirSync(logDir).filter((f) => f.endsWith(".log")).sort();
  const files = filterNames
    ? allFiles.filter((f) => filterNames.some((name) => f === `${name}.log`))
    : allFiles;

  if (files.length === 0) {
    const msg = filterNames
      ? `No log files found for: ${filterNames.join(", ")}\nAvailable: ${allFiles.map((f) => f.replace(/\.log$/, "")).join(", ") || "(none)"}`
      : `No log files found in ${logDir}`;
    throw new Error(msg);
  }

  const col = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
  };

  console.log(`${col.bold}Following logs${col.reset} from ${col.cyan}${logDir}${col.reset}`);
  console.log(`${col.dim}Files: ${files.join(", ")}${col.reset}`);
  console.log(`${col.dim}Press Ctrl+C to stop${col.reset}\n`);

  // Assign a color to each file for visual distinction
  const palette = [
    "\x1b[32m", // green
    "\x1b[33m", // yellow
    "\x1b[34m", // blue
    "\x1b[35m", // magenta
    "\x1b[36m", // cyan
    "\x1b[91m", // bright red
    "\x1b[92m", // bright green
    "\x1b[93m", // bright yellow
    "\x1b[94m", // bright blue
    "\x1b[95m", // bright magenta
  ];

  const maxNameLen = Math.max(...files.map((f) => f.replace(/\.log$/, "").length));

  // Track file watchers for cleanup
  const watchers: fs.FSWatcher[] = [];
  const filePositions = new Map<string, number>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(logDir, file);
    const name = file.replace(/\.log$/, "");
    const color = palette[i % palette.length];
    const prefix = `${color}${name.padEnd(maxNameLen)}${col.reset} ${col.dim}|${col.reset} `;

    // Read existing content from the end (last 50 lines) for context
    const initialContent = readTail(filePath, 50);
    if (initialContent) {
      for (const line of initialContent.split("\n")) {
        if (line) console.log(`${prefix}${line}`);
      }
    }

    // Track current position
    const stat = fs.statSync(filePath);
    filePositions.set(filePath, stat.size);

    // Watch for changes
    const watcher = fs.watch(filePath, () => {
      const prevPos = filePositions.get(filePath) ?? 0;
      let currentSize: number;
      try {
        currentSize = fs.statSync(filePath).size;
      } catch {
        return;
      }

      if (currentSize <= prevPos) {
        // File was truncated — reset position
        filePositions.set(filePath, 0);
        return;
      }

      // Read new bytes
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(currentSize - prevPos);
      fs.readSync(fd, buf, 0, buf.length, prevPos);
      fs.closeSync(fd);
      filePositions.set(filePath, currentSize);

      const text = buf.toString("utf-8");
      for (const line of text.split("\n")) {
        if (line) console.log(`${prefix}${line}`);
      }
    });
    watchers.push(watcher);
  }

  // Keep alive until Ctrl+C
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      for (const w of watchers) w.close();
      resolve();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
}

/** Read the last N lines of a file. */
function readTail(filePath: string, lines: number): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}
