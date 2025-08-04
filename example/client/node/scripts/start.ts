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
  }, {
    stopProcessAtPort: [9944, 8088, 6300],
    processes: [
      {
        name: ComponentNames.MIDNIGHT_NODE,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-node:start",
        ],
        logs: "none",
        waitToExit: false,
        type: "system-dependency",
      },
      {
        name: ComponentNames.MIDNIGHT_INDEXER,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-indexer:start",
        ],
        waitToExit: false,
        type: "system-dependency",
      },
      {
        name: ComponentNames.MIDNIGHT_PROOF_SERVER,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-proof-server:start",
        ],
        waitToExit: false,
        type: "system-dependency",
      },
      {
        name: ComponentNames.MIDNIGHT_NODE_WAIT,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-node:wait",
        ],
      },
      {
        name: ComponentNames.MIDNIGHT_INDEXER_WAIT,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-indexer:wait",
        ],
      },
      {
        name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-proof-server:wait",
        ],
      },
      {
        name: ComponentNames.MIDNIGHT_CONTRACT,
        args: [
          "task",
          "-f",
          "@example/midnight-contracts",
          "midnight-contract:deploy",
        ],
      },
    ],
  } // // Uncomment to enable Avail Process
    // // Note: Check ports as 9944 is used by Midnight Node by default in the lace wallet
    //  {
    //   stopProcessAtPort: [9944, 7007],
    //   processes: [
    //     {
    //       name: ComponentNames.AVAIL_NODE,
    //       args: ["task", "-f", "@example/avail-contracts", "avail-node:start"],
    //       waitToExit: false,
    //       logs: "none",
    //       type: "system-dependency",
    //     },
    //     {
    //       name: ComponentNames.AVAIL_CLIENT,
    //       args: [
    //         "task",
    //         "-f",
    //         "@example/avail-contracts",
    //         "avail-light-client:start",
    //       ],
    //       waitToExit: false,
    //       type: "system-dependency",
    //     },
    //     {
    //       name: ComponentNames.AVAIL_NODE_WAIT,
    //       args: ["task", "-f", "@example/avail-contracts", "avail-node:wait"],
    //     },
    //     {
    //       name: ComponentNames.AVAIL_CLIENT_WAIT,
    //       args: [
    //         "task",
    //         "-f",
    //         "@example/avail-contracts",
    //         "avail-light-client:wait",
    //       ],
    //     },
    //   ],
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

await start(config);
