import { fetchLogs, startServer, type TsLogExported } from "./logs-server.ts";

// This is a standalone script that can be used to view logs from the collector.
// Its purpose is to be used in a tmux session, and not as a part of the TUI.
class LogsViewer {
  private readonly pollInterval = 300; // ms
  public isRunning = false;

  formatLogEntry(entry: TsLogExported): string {
    const timestamp = new Date(entry._meta.date).toLocaleTimeString();
    const level = entry._meta.logLevelName;
    // The log message is in the "0" field and contains ANSI color codes
    const message = entry["0"];
    const grey = (m: string) => `\x1b[90m${m}\x1b[0m`;

    return `${grey(timestamp)} ${level} ${message}`;
  }

  async displayAndSaveLogs(logs: TsLogExported[]): Promise<void> {
    // Only show new logs since last fetch\
    const ddmmyyyy = new Date().toISOString().split("T")[0];
    const fileBuffer: Record<string, string[]> = {};
    for (const log of logs) {
      const formatedLog = this.formatLogEntry(log);
      const cleanLog = formatedLog.replace(this.ansiRegex(), "");
      const namespace =
        log["0"].replace(this.ansiRegex(), "").match(/^([\w-]+):\s/)?.[1] ??
          "unknown";

      // Write output to console.
      console.log(formatedLog);
      if (!fileBuffer[namespace]) {
        fileBuffer[namespace] = [];
      }
      fileBuffer[namespace].push(cleanLog);
    }

    // Write output to file.
    for (const [namespace, buffer] of Object.entries(fileBuffer)) {
      await Deno.writeFile(
        `./logs/${namespace}-${ddmmyyyy}.log`,
        new TextEncoder().encode(buffer.join("\n") + "\n"),
        { append: true },
      );
    }
    return;
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
    const poll = async () => {
      if (!this.isRunning) return;
      const logs = await fetchLogs();
      await this.displayAndSaveLogs(logs);
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
  if (Deno.env.get("TMUX")) {
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
