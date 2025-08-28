import { ComponentNames } from "@paima/log";
//
// Start EVM (Hardhat) Chains and deploy contracts.
//
// This is a example launcher for EVM Chains and Contracts.
// Working implementation examples are provided in the /templates/* folders.
// Normally you would not need to modify this file.
//
// This file requires you to provide a workspace package with the following tasks:
//
// chain:start: start the chain
// chain:wait: wait for the chain to start
// deploy: script that deploys the contracts to the chain
//
// packageName: the name of the package that implements the tasks.
//
export const launchEvm = (packageName: string) => ({
  stopProcessAtPort: [8545, 8546],
  processes: [
    {
      name: ComponentNames.HARDHAT,
      args: ["task", "-f", packageName, "chain:start"],
      waitToExit: false,
      logs: "otel-compatible",
      type: "system-dependency",
    },
    {
      name: ComponentNames.HARDHAT_WAIT,
      args: ["task", "-f", packageName, "chain:wait"],
    },
    {
      name: ComponentNames.DEPLOY_EVM_CONTRACTS,
      args: ["task", "-f", packageName, "deploy"],
      type: "system-dependency",
    },
  ],
});
