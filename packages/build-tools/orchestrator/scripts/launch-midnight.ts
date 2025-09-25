import { ComponentNames } from "@paima/log";

// Start Midnight Node and Indexer.
//
// This is a example launcher for Midnight Chains and Contracts.
// Working implementation examples are provided in the /templates/* folders.
// Normally you would not need to modify this file.
//
// This file requires you to provide a workspace package with the following tasks:
//
// midnight-node:start: start the midnight node
// midnight-indexer:start: start the midnight indexer
// midnight-proof-server:start: start the midnight proof server
// midnight-node:wait: wait for the midnight node to start
// midnight-indexer:wait: wait for the midnight indexer to start
// midnight-proof-server:wait: wait for the midnight proof server to start
//
// packageName: the name of the package that implements the tasks.
//
export const launchMidnight = (packageName: string) => ({
  stopProcessAtPort: [9944, 8088, 6300],
  processes: [
    {
      name: ComponentNames.MIDNIGHT_NODE,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-node:start",
      ],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.MIDNIGHT_INDEXER,
      args: [
        "task",
        "-f",
        packageName,
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
        packageName,
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
        packageName,
        "midnight-node:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_INDEXER_WAIT,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-indexer:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-proof-server:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_CONTRACT,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-contract:deploy",
      ],
    },
  ],
});
