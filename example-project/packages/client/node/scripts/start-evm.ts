import { ComponentNames } from "@paimaexample/log";

export const startEvm = {
  // Start EVM (Hardhat) Chains and deploy contracts.
  stopProcessAtPort: [8545, 8546],
  processes: [
    {
      name: ComponentNames.HARDHAT,
      args: ["task", "-f", "@example/evm-contracts", "chain:start"],
      waitToExit: false,
      // logs: "otel-compatible",
      // logs: "none",
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
};
