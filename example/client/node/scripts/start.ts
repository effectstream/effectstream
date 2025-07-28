import {
  OrchestratorConfig,
  type ProcessComponent,
  start,
} from "@paima/orchestrator";
import { ComponentNames } from "@paima/log";
import { Value } from "@sinclair/typebox/value";
import { contractAddressesEvmMain } from "@example/evm-contracts";

const config = Value.Parse(OrchestratorConfig, {
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.PAIMA_DB]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  packageName: "@paima",

  // Launch my processes
  processesToLaunch: [{
    // Start EVM (Hardhat) Chains and deploy contracts.
    stopProcessAtPort: [8545, 8546],
    processes: [
      {
        name: ComponentNames.HARDHAT,
        args: ["task", "-f", "@example/evm-contracts", "chain:start"],
        waitToExit: false,
        logs: "otel-compatible",
        type: "system-dependency",
      },
      {
        name: ComponentNames.HARDHAT_WAIT,
        args: ["task", "-f", "@example/evm-contracts", "chain:wait"],
      },
      {
        name: ComponentNames.DEPLOY_EVM_CONTRACTS,
        args: ["task", "-f", "@example/evm-contracts", "deploy"],
        type: "system-dependency",
      },
    ],
  }, {
    // TODO "stopProcessAtPort" is a workaround to kill any processes that are still running from a previous run.
    // Cardano processes 8090, 10000. Do not terminate cleanly.
    // Unfortunately required because of https://github.com/bloxbean/yaci-devkit/issues/94
    stopProcessAtPort: [8090, 10000, 50051, 3001],
    processes: [
      {
        name: ComponentNames.YACI_DEVKIT,
        args: ["task", "-f", "@example/cardano-contracts", "devkit:start"],
        waitToExit: false,
        logs: "otel-compatible",
        type: "system-dependency",
      },
      {
        name: ComponentNames.YACI_DEVKIT_WAIT,
        args: ["task", "-f", "@example/cardano-contracts", "devkit:wait"],
      },
      {
        name: ComponentNames.DOLOS,
        args: ["task", "-f", "@example/cardano-contracts", "dolos:start"],
        waitToExit: false,
        type: "system-dependency",
      },
      {
        name: ComponentNames.DOLOS_WAIT,
        args: ["task", "-f", "@example/cardano-contracts", "dolos:wait"],
      },
    ],
  }],

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

await start(config);
