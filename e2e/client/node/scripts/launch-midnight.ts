import { ComponentNames } from "@paima/log";

export const launchMidnight = {
  stopProcessAtPort: [9944, 8088, 6300],
  processes: [
    {
      name: ComponentNames.MIDNIGHT_NODE,
      args: [
        "task",
        "-f",
        "@e2e/midnight-contracts",
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
        "@e2e/midnight-contracts",
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
        "@e2e/midnight-contracts",
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
        "@e2e/midnight-contracts",
        "midnight-node:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_INDEXER_WAIT,
      args: [
        "task",
        "-f",
        "@e2e/midnight-contracts",
        "midnight-indexer:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
      args: [
        "task",
        "-f",
        "@e2e/midnight-contracts",
        "midnight-proof-server:wait",
      ],
    },
    {
      name: ComponentNames.MIDNIGHT_CONTRACT,
      args: [
        "task",
        "-f",
        "@e2e/midnight-contracts",
        "contract:deploy",
      ],
    },
  ],
};
