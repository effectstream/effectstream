import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@paimaexample/orchestrator";
import { ComponentNames } from "@paimaexample/log";
import { Value } from "@sinclair/typebox/value";
// import { launchAvail } from "@paima/orchestrator/start-avail";
// import { launchCardano } from "@paimaexample/orchestrator/start-cardano";
import { launchEvm } from "@paimaexample/orchestrator/start-evm";
// import { launchMidnight } from "@paimaexample/orchestrator/start-midnight";

const config = Value.Parse(OrchestratorConfig, {
  packageName: "@paimaexample",
  logs: "stdout",
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_PGLITE]: true,
    [ComponentNames.COLLECTOR]: false,
    [ComponentNames.TMUX]: false,
    [ComponentNames.TUI]: false,
    [ComponentNames.DOCS]: false,
    [ComponentNames.PAIMA_BATCHER]: false,
  },

  // Launch my processes
  processesToLaunch: [
    launchEvm("@minimal/evm-contracts"),
  ],
  // Launch the Batcher with our PaimaL2 Contract
  // batcher: {
  //   batchIntervalMs: 100,
  //   paimaL2Address: contractAddressesEvmMain()["chain31337"][
  //     "PaimaL2ContractModule#MyPaimaL2Contract"
  //   ],
  //   paimaSyncProtocolName: "parallelEvmRPC_fast",
  //   batcherPrivateKey:
  //     "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  //   chainName: "hardhat",
  // },
});

await start(config);
