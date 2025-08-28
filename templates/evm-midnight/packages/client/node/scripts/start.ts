import { OrchestratorConfig, start } from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
import { contractAddressesEvmMain } from "@example/evm-contracts";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";
import { launchCardano } from "@paimaexample/orchestrator/start-cardano";
import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

const midnightExtended = (packageName: string) => ({
  stopProcessAtPort: [
    ...launchMidnight(packageName).stopProcessAtPort,
    10599,
  ],
  processes: [
    ...launchMidnight(packageName).processes,
    // We build the frontend after the midnight process is started, as it uses the contract address at build time.
    {
      name: "frontend-build",
      args: ["task", "-f", "@example/frontend", "build"],
      waitToExit: true,
    },
    {
      name: "frontend-server",
      args: ["task", "-f", "@example/frontend", "server:start"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:10599",
    },
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
  processes: {
    [ComponentNames.TMUX]: true,
    [ComponentNames.TUI]: true,
    [ComponentNames.DOCS]: false,

    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "jsr:@paimaexample",

  // Launch my processes
  processesToLaunch: [
    launchEvm("@example/evm-contracts"),
    // launchCardano("@example/cardano-contracts"),
    midnightExtended("@example/midnight-contracts"),
    // launchAvail("@example/avail-contracts"),
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
