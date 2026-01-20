import { attachTransport, log } from "@effectstream/log";
import { LogServer, type OTelLog } from "./logs-server.ts";
import { createStream, type RotatingFileStream } from "rotating-file-stream";
import type { ILogObj } from "tslog";
import { ENV } from "@effectstream/utils/node-env";
import { spawn } from "node:child_process";
import fs from "node:fs";

// This is a standalone script that can be used to view logs from the collector.
// Its purpose is to be used in a tmux session, and not as a part of the TUI.
class LogsViewer {
  public isRunning = false;
  private logDisplayStates: Record<string, boolean> = {};
  private logServer: LogServer;
  private readonly logDirectory: string;

  constructor() {
    this.logServer = new LogServer();
    const calledFrom = process.env.INIT_CWD ?? ".";
    const envLogsPath = process.env.LOGS_PATH;
    this.logDirectory = envLogsPath ?? `${calledFrom}/logs`;
  }

  private streams: Record<string, RotatingFileStream> = {};
  private getStream(
    namespace: string,
  ): { isNew: boolean; stream: RotatingFileStream } {
    if (this.streams[namespace]) {
      return { isNew: false, stream: this.streams[namespace] };
    }
    this.streams[namespace] = createStream(`${this.logDirectory}/${namespace}.log`, {
      size: "10M", // rotate every 10 MegaBytes written
      interval: "1d", // rotate daily
      compress: "gzip", // compress rotated files
    });
    return { isNew: true, stream: this.streams[namespace] };
  }

  private shouldDisplayLog(logEntry: OTelLog): boolean {
    // Try to match log entry to a process by component name first, then namespace
    if (logEntry.component in this.logDisplayStates) {
      return this.logDisplayStates[logEntry.component];
    }
    return true;
  }

  displayLogs(logs: OTelLog[]): void {
    // Update log display states from server memory (no API call)
    this.logDisplayStates = this.logServer.getAllLogDisplayStates();

    // Only show logs for processes that have display enabled
    for (const logEntry of logs) {
      if (this.shouldDisplayLog(logEntry)) {
        log.localForce(
          logEntry.component,
          logEntry.namespace,
          Number(logEntry.level),
          (log) => {
            log(...logEntry.message);
          },
        );
      }
    }
  }

  ansiRegex({ onlyFirst = false } = {}) {
    // Valid string terminator sequences are BEL, ESC\, and 0x9c
    const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
    const pattern = [
      `[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?${ST})`,
      "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
    ].join("|");

    return new RegExp(pattern, onlyFirst ? undefined : "g");
  }

  async start(): Promise<void> {
    console.log("🔍 Starting log server...");

    try {
      fs.lstatSync(this.logDirectory);
    } catch (_error) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }

    // Set up displayLogs's destination
    attachTransport((logObj: ILogObj) => {
      const message = logObj[0] as string;
      const cleanMessage = message.replace(this.ansiRegex(), "");
      const date = (logObj._meta as any).date as Date;
      const namespace = cleanMessage.match(/^([\w-]+):\s/)?.[1] ??
        "no-namespace";
      const { stream } = this.getStream(namespace);
      stream.write(
        `${date.toISOString()} ${cleanMessage}\n`,
      );
    });

    // Attach log server to displayLogs then start the log server
    this.logServer.on("addLogs", (logs) => this.displayLogs(logs));
    await this.logServer.start();

    this.isRunning = true;
    console.log("🔍 Log viewer started. Press Ctrl+C to stop.");
  }
}

// Auto initialize the server
const viewer = new LogsViewer();

// In case of spawing from tmux, kill the parent tmux session
// so that ctrl+c terminates the entire effectstream-engine process`
const killTmux = () => {
  if (ENV.TMUX) {
    spawn("tmux", ["kill-session"], { stdio: "ignore" });
  }
};

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Stopping log viewer...");
  viewer.isRunning = false;
  killTmux();
  process.exit(0);
});

try {
  await viewer.start();
} catch (error) {
  console.error(error);
  killTmux();
  process.exit(1);
}
