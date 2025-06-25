import { attachTransport, log } from "@paima/log";
import { fetchLogs, type OTelLog, startServer } from "./logs-server.ts";
import { createStream, type RotatingFileStream } from "rotating-file-stream";
import type { ILogObj } from "npm:tslog@^4.9.3";
import { ENV } from "@paima/utils";

// This is a standalone script that can be used to view logs from the collector.
// Its purpose is to be used in a tmux session, and not as a part of the TUI.
class LogsViewer {
  private readonly pollInterval = 300; // ms
  public isRunning = false;

  private streams: Record<string, RotatingFileStream> = {};
  private getStream(
    namespace: string,
  ): { isNew: boolean; stream: RotatingFileStream } {
    if (this.streams[namespace]) {
      return { isNew: false, stream: this.streams[namespace] };
    }
    this.streams[namespace] = createStream(`./logs/${namespace}.log`, {
      size: "10M", // rotate every 10 MegaBytes written
      interval: "1d", // rotate daily
      compress: "gzip", // compress rotated files
    });
    return { isNew: true, stream: this.streams[namespace] };
  }

  displayLogs(logs: OTelLog[]): void {
    // Only show new logs since last fetch
    for (const logEntry of logs) {
      log.local(
        logEntry.component,
        logEntry.namespace,
        logEntry.level,
        (log) => {
          log(...logEntry.message);
        },
      );
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
    await startServer();
    console.log("🔍 Starting log viewer...");
    console.log(`📡 Polling every ${this.pollInterval}ms`);
    console.log("Press Ctrl+C to stop\n");

    this.isRunning = true;
    try {
      Deno.lstatSync("./logs");
    } catch (error) {
      Deno.mkdirSync("./logs", { recursive: true });
    }

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

    const poll = async () => {
      if (!this.isRunning) return;
      const logs = await fetchLogs();
      this.displayLogs(logs);
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      poll();
    };

    // Start polling
    poll();
  }
}

// Auto initialize the server
const viewer = new LogsViewer();

// In case of spawing from tmux, kill the parent tmux session
// so that ctrl+c terminates the entire paima-engine process`
const killTmux = () => {
  if (ENV.TMUX) {
    const cmd = new Deno.Command("tmux", { args: ["kill-session"] });
    cmd.spawn();
  }
};

// Handle graceful shutdown
Deno.addSignalListener("SIGINT", () => {
  console.log("\n👋 Stopping log viewer...");
  viewer.isRunning = false;
  killTmux();
  Deno.exit(0);
});

viewer.start().then(() => {
  console.log("🔍 Log viewer started");
}).catch((error) => {
  console.error(error);
  killTmux();
  Deno.exit(1);
});
