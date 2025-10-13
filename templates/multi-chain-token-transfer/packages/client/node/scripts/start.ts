import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

const midnightExtended = (packageName: string) => ({
  stopProcessAtPort: [
    ...launchMidnight(packageName).stopProcessAtPort,
    10599,
  ],
  processes: [
    ...launchMidnight(packageName).processes,
    // {
    //   name: "frontend-server",
    //   args: ["task", "-f", "@multi-chain-transfer/frontend", "build"],
    //   waitToExit: true,
    //   type: "system-dependency",
    // },
    // {
    //   name: "frontend-server",
    //   args: ["task", "-f", "@multi-chain-transfer/frontend", "serve"],
    //   waitToExit: false,
    //   type: "system-dependency",
    //   link: "http://localhost:10599",
    // },
    {
      name: "explorer",
      args: ["run", "-A", "--unstable-detect-cjs", "@paimaexample/explorer"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:10590",
    },
  ],
});

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
    launchEvm("@multi-chain-transfer/evm-contracts"),
    // launchCardano("@multi-chain-transfer/cardano-contracts"),
    midnightExtended("@multi-chain-transfer/midnight-contracts"),
    // launchAvail("@multi-chain-transfer/avail-contracts"),
    { // Launch the Batcher with our PaimaL2 Contract
      name: "batcher",
      args: ["task", "-f", "@multi-chain-transfer/batcher", "start"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
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
