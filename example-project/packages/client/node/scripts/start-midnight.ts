import { ComponentNames } from "@paimaexample/log";

export const startMidnight = {
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
      // logs: "none",
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
      name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
      args: [
        "task",
        "-f",
        "@example/midnight-contracts",
        "midnight-proof-server:wait",
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
      name: ComponentNames.MIDNIGHT_CONTRACT,
      args: [
        "task",
        "-f",
        "@example/midnight-contracts",
        "midnight-contract:deploy",
      ],
    },
  ],
};
