// Shared logger for batcher adapters
// Writes to both console and a debug log file with timestamp and adapter prefix

import * as fs from "node:fs";

const LOG_FILE = "batcher-debug.log";

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
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(LOG_FILE, logMessage);
    } catch {
      // Ignore if we can't write
    }
  }
}
