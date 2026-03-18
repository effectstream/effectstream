import type { ParsedArgs } from "../cli.ts";
import { OrchestratorClient } from "../api-client.ts";
import { logInfo, logError } from "../display.ts";

type RestartOptions = Pick<ParsedArgs, "positionals" | "flags"> & {
  port?: number;
};

export async function runRestartCommand(opts: RestartOptions): Promise<void> {
  const name = opts.positionals[0];
  if (!name) {
    logError("Usage: orchestrator-v2 restart <process-name>");
    process.exit(1);
  }

  const client = new OrchestratorClient(opts.port);

  if (!(await client.isRunning())) {
    logError(
      "Orchestrator daemon is not running. Start it with: orchestrator-v2 start",
    );
    process.exit(1);
  }

  logInfo(`Restarting "${name}"…`);
  const result = await client.restart(name);

  if (result.error) {
    logError(result.error);
    process.exit(1);
  }

  logInfo(`"${name}" restarted successfully.`);
}
