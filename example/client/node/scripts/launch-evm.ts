import { ComponentNames } from "@paima/log";

export const launchEvm = {
  // Start EVM (Hardhat) Chains and deploy contracts.
  stopProcessAtPort: [8545, 8546],
  processes: [
    {
      name: ComponentNames.HARDHAT,
      args: ["task", "-f", "@e2e/evm-contracts", "chain:start"],
      waitToExit: false,
      logs: "otel-compatible",
      type: "system-dependency",
    },
    {
      name: ComponentNames.HARDHAT_WAIT,
      args: ["task", "-f", "@e2e/evm-contracts", "chain:wait"],
    },
    {
      name: ComponentNames.DEPLOY_EVM_CONTRACTS,
      args: ["task", "-f", "@e2e/evm-contracts", "deploy"],
      type: "system-dependency",
    },
  ],
};
