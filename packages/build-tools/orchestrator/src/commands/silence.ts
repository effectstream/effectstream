import type { ParsedArgs } from "../cli.ts";
import { OrchestratorClient } from "../api-client.ts";
import { logInfo, logError } from "../display.ts";

type SilenceOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

export async function runSilenceCommand(opts: SilenceOptions): Promise<void> {
  const names = opts.positionals;
  const unsilence = opts.flags["unsilence"] === true;

  const client = new OrchestratorClient(opts.port);

  if (!(await client.isRunning())) {
    logError(
      "Orchestrator daemon is not running. Start it with: orchestrator start",
    );
    process.exit(1);
  }

  if (names.length === 0) {
    // Show currently silenced processes
    const silenced = await client.getSilenced();
    if (silenced.length === 0) {
      logInfo("No processes are silenced.");
    } else {
      logInfo(`Silenced processes: ${silenced.join(", ")}`);
    }
    return;
  }

  const result = await client.silence(names, unsilence);

  if (result.error) {
    logError(result.error);
    process.exit(1);
  }

  if (unsilence) {
    logInfo(`Unsilenced: ${names.join(", ")}`);
  } else {
    logInfo(`Silenced: ${names.join(", ")}`);
  }

  if (result.silenced && result.silenced.length > 0) {
    logInfo(`Currently silenced: ${result.silenced.join(", ")}`);
  }
}
