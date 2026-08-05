// Shared logger for batcher adapters
// Writes to both console and a debug log file with timestamp and adapter prefix

import * as fs from "node:fs";

const LOG_FILE = "batcher-debug.log";

/**
 * File logging is opt-in (BATCHER_DEBUG_LOG=1). `appendFileSync` blocks the
 * event loop on every line — with several adapters sharing a process that is a
 * throughput tax paid on the hot path, and the file is unrotated/unbounded.
 * Console output is unaffected.
 */
const FILE_LOGGING_ENABLED = process.env.BATCHER_DEBUG_LOG === "1";

export class AdapterLogger {
  private readonly prefix: string;

  constructor(adapterName: string) {
    this.prefix = `[${adapterName}]`;
  }

  log(message: string, ...args: unknown[]): void {
    const formatted = `${this.prefix} ${message}`;
    this.writeToFile(formatted);
    if (args.length > 0) {
      console.log(formatted, ...args);
    } else {
      console.log(formatted);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    const formatted = `${this.prefix} ${message}`;
    this.writeToFile(`WARN ${formatted}`);
    if (args.length > 0) {
      console.warn(formatted, ...args);
    } else {
      console.warn(formatted);
    }
  }

  error(message: string, ...args: unknown[]): void {
    const formatted = `${this.prefix} ${message}`;
    this.writeToFile(`ERROR ${formatted}`);
    if (args.length > 0) {
      console.error(formatted, ...args);
    } else {
      console.error(formatted);
    }
  }

  private writeToFile(message: string): void {
    if (!FILE_LOGGING_ENABLED) return;
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(LOG_FILE, logMessage);
    } catch {
      // Ignore if we can't write
    }
  }
}
