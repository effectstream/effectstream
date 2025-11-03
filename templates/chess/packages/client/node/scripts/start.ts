import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";

const evmProcessesExtended = launchEvm("@chess/evm-contracts");
evmProcessesExtended.stopProcessAtPort.push(3334);
evmProcessesExtended.processes.push({
  name: "batcher",
  args: ["task", "-f", "@chess/batcher", "start"],
  waitToExit: false,
  type: "system-dependency",
  logs: "none",
});

const config = Value.Parse(OrchestratorConfig, {
  // Launch system processes
  // logs: "stdout",
  packageName: "jsr:@paimaexample",
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    [ComponentNames.DOCS]: false,
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  // Launch my processes
  processesToLaunch: [
    evmProcessesExtended,
    {
      stopProcessAtPort: [10590, 10599],
      processes: [
        {
          name: "frontend-server",
          args: ["task", "-f", "@chess/frontend", "build"],
          waitToExit: true,
          type: "system-dependency",
          link: "http://localhost:10599",
        },
        {
          name: "frontend-server",
          args: ["task", "-f", "@chess/frontend", "serve"],
          waitToExit: false,
          type: "system-dependency",
          link: "http://localhost:10599",
        },
        {
          name: "explorer",
          args: [
            "run",
            "-A",
            "--unstable-detect-cjs",
            "@paimaexample/explorer",
          ],
          waitToExit: false,
          type: "system-dependency",
          link: "http://localhost:10590",
        },
      ],
    },
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
