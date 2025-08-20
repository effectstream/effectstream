import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { contractAddressesEvmMain } from "@example/evm-contracts";
import { startEvm } from "./start-evm.ts";
import { startCardano } from "./start-cardano.ts";
import { startMidnight } from "./start-midnight.ts";

const midnightExtended = {
  stopProcessAtPort: [...startMidnight.stopProcessAtPort, 10599],
  processes: [
    ...startMidnight.processes,
    {
      name: "Frontend Build",
      args: ["task", "-f", "@example/frontend", "build"],
      waitToExit: true,
    },
    {
      name: "Frontend Server",
      args: ["task", "-f", "@example/frontend", "server:start"],
      waitToExit: false,
      type: "system-dependency",
    },
  ],
};

const config = Value.Parse(OrchestratorConfig, {
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,

    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "jsr:@paimaexample",

  // Launch my processes
  processesToLaunch: [
    startEvm,
    // startCardano,
    midnightExtended,
    // startAvail,
  ],

  // Launch the Batcher with our PaimaL2 Contract
  batcher: {
    paimaL2Address: contractAddressesEvmMain()["chain31337"][
      "PaimaL2ContractModule#MyPaimaL2Contract"
    ],
    batcherPrivateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    chainName: "hardhat",
  },
});

if (Deno.env.get("PAIMA_STDOUT")) {
  config.logs = "stdout";
  config.processes[ComponentNames.TMUX] = false;
  config.processes[ComponentNames.TUI] = false;
  config.processes[ComponentNames.COLLECTOR] = false;
}

await start(config);
