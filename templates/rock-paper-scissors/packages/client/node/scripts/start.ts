import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";

const customProcesses = [
  {
    name: "explorer",
    args: ["run", "-A", "--unstable-detect-cjs", "@paimaexample/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  {
    name: "install-frontend",
    args: ["task", "-f", "@rock-paper-scissors/frontend", "install"],
    waitToExit: true,
    type: "system-dependency",
  },
  {
    name: "build-frontend",
    args: ["task", "-f", "@rock-paper-scissors/frontend", "build"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: ["install-frontend"],
  },
  {
    name: "serve-frontend",
    args: ["task", "-f", "@rock-paper-scissors/frontend", "serve"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:8080",
    stopProcessAtPort: [8080],
    dependsOn: ["build-frontend"],
  },
];

const config = Value.Parse(OrchestratorConfig, {
  packageName: "jsr:@paimaexample",
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  processesToLaunch: [
    ...launchEvm("@rock-paper-scissors/evm-contracts"),
    ...customProcesses,
  ],
});

if (Deno.env.get("EFFECTSTREAM_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
