import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";

const config = Value.Parse(OrchestratorConfig, {
  // Launch system processes
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
    launchEvm("@chess/evm-contracts"),
    {
      stopProcessAtPort: [10590, 10599, 3334],
      processes: [
        // We build the frontend as "dev" command fails running from the orchestrator.
        // For development - comment the build and server::start commands
        // {
        //   name: "frontend-build",
        //   args: ["task", "-f", "@chess/frontend", "build"],
        //   waitToExit: true,
        // },
        {
          name: "frontend-server",
          args: ["task", "-f", "@chess/frontend", "server:start"],
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
        { // Launch the Batcher with our PaimaL2 Contract
          name: "batcher",
          args: ["task", "-f", "@chess/batcher", "start"],
          waitToExit: false,
          type: "system-dependency",
          link: "http://localhost:3334",
        },
      ],
    },
  ],
});

if (Deno.env.get("PAIMA_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
