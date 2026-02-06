import {
  OrchestratorConfig,
  start,
} from "@effectstream/orchestrator";
import { ComponentNames } from "@effectstream/log";
import { Value } from "@sinclair/typebox/value";
import { launchCardano } from "@effectstream/orchestrator/start-cardano";
import { launchMidnight } from "@effectstream/orchestrator/start-midnight";

const config = Value.Parse(OrchestratorConfig, {
  packageName: "@effectstream",
  logs: "stdout",
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: false,
    [ComponentNames.TMUX]: false,
    [ComponentNames.TUI]: false,
  },

  // Launch my processes
  processesToLaunch: [
    ...launchCardano("@minimal-cardano/cardano-contracts"),
    ...launchMidnight("@minimal-cardano/midnight-contracts"),
  ],
  // Launch the Batcher with our PaimaL2 Contract
  // batcher: {
  //   batchIntervalMs: 100,
  //   paimaL2Address: contractAddressesEvmMain()["chain31337"][
  //     "PaimaL2ContractModule#MyPaimaL2Contract"
  //   ],
  //   paimaSyncProtocolName: "parallelEvmRPC_fast",
  //   batcherPrivateKey:`
  //     "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  //   chainName: "hardhat",
  // },
});

await start(config);
