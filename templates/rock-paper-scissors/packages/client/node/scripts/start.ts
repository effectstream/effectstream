import { OrchestratorConfig, start } from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@effectstream/orchestrator/start-evm";

const customProcesses = [
  {
    name: "explorer",
    args: ["run", "@effectstream/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  {
    name: "install-frontend",
    args: ["run", "--filter", "@rock-paper-scissors/frontend", "install"],
    waitToExit: true,
    type: "system-dependency",
  },
  {
    name: "build-frontend",
    args: ["run", "--filter", "@rock-paper-scissors/frontend", "build"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: ["install-frontend"],
  },
  {
    name: "serve-frontend",
    args: ["run", "--filter", "@rock-paper-scissors/frontend", "serve"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:8080",
    stopProcessAtPort: [8080],
    dependsOn: ["build-frontend"],
  },
];

const config = Value.Parse(OrchestratorConfig, {
  packageName: "@effectstream",
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

if (process.env.EFFECTSTREAM_STDOUT) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
