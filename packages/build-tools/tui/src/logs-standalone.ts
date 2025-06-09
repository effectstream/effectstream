import { API_LOG_URL } from "./config.ts";

// This is a standalone script that can be used to view logs from the collector.
// Its purpose is to be used in a tmux session, and not as a part of the TUI.

interface LogEntry {
  "0": string;
  _meta: {
    runtime: string;
    runtimeVersion: string;
    hostname: string;
    date: string;
    logLevelId: number;
    logLevelName: string;
    path: {
      fullFilePath: string;
      fileName: string;
      fileNameWithLine: string;
      fileColumn: string;
      fileLine: string;
      filePath: string;
      filePathWithLine: string;
    };
  };
}

class LogsViewer {
  private readonly apiUrl = API_LOG_URL + "/v1/data";
  private readonly pollInterval = 300; // ms
  private isRunning = false;

  async fetchLogs(): Promise<LogEntry[]> {
    try {
      const response = await fetch(this.apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(
        `Failed to fetch logs: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return [];
    }
  }

  formatLogEntry(entry: LogEntry): string {
    const timestamp = new Date(entry._meta.date).toLocaleTimeString();
    const level = entry._meta.logLevelName.padEnd(5);
    // The log message is in the "0" field and contains ANSI color codes
    const message = entry["0"];
    const grey = (m: string) => `\x1b[90m${m}\x1b[0m`;

    return `[${grey(timestamp)}] ${level} ${message}`;
  }

  displayLogs(logs: LogEntry[]): void {
    // Only show new logs since last fetch

    if (logs.length > 0) {
      logs.forEach((log) => {
        console.log(this.formatLogEntry(log));
      });
    }
  }

  start(): void {
    console.log("🔍 Starting log viewer...");
    console.log(`📡 Polling ${this.apiUrl} every ${this.pollInterval}ms`);
    console.log("Press Ctrl+C to stop\n");

    this.isRunning = true;

    const poll = async () => {
      if (!this.isRunning) return;

      const logs = await this.fetchLogs();
      this.displayLogs(logs);

      setTimeout(poll, this.pollInterval);
    };

    // Start polling
    poll();

    // Handle graceful shutdown
    Deno.addSignalListener("SIGINT", () => {
      console.log("\n👋 Stopping log viewer...");
      this.isRunning = false;
      if (Deno.env.get("TMUX")) {
        const cmd = new Deno.Command("tmux", { args: ["kill-session"] });
        cmd.spawn();
      }
      Deno.exit(0);
    });
  }
}

const viewer = new LogsViewer();
viewer.start();
