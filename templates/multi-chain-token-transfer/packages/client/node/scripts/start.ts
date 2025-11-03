import { OrchestratorConfig, start } from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@effectstream/orchestrator/start-evm";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";

const customProcesses = [
  {
    name: "frontend-build",
    args: ["task", "-f", "@multi-chain-transfer/frontend", "build"],
    waitToExit: true,
    type: "system-dependency",
    dependsOn: [ComponentNames.DEPLOY_EVM_CONTRACTS, ComponentNames.MIDNIGHT_CONTRACT],
  },
  {
    name: "frontend-server",
    args: ["task", "-f", "@multi-chain-transfer/frontend", "serve"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10599",
    stopProcessAtPort: [10599],
    dependsOn: ["frontend-build"],
  },
  {
    name: "explorer",
    args: ["run", "-A", "--unstable-detect-cjs", "@effectstream/explorer"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:10590",
    stopProcessAtPort: [10590],
  },
  {
    name: "batcher",
    args: ["task", "-f", "@multi-chain-transfer/batcher", "start"],
    waitToExit: false,
    type: "system-dependency",
    link: "http://localhost:3334",
    stopProcessAtPort: [3334],
    dependsOn: [ComponentNames.DEPLOY_EVM_CONTRACTS, ComponentNames.MIDNIGHT_CONTRACT],
  },
]

const config = Value.Parse(OrchestratorConfig, {
  // Launch system processes
  packageName: "jsr:@effectstream",
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  // Launch my processes
  processesToLaunch: [
    ...launchEvm("@multi-chain-transfer/evm-contracts"),
    ...launchMidnight("@multi-chain-transfer/midnight-contracts"),
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
