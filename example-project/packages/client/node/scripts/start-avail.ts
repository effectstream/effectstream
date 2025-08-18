import { ComponentNames } from "@paimaexample/log";

export const startAvail = {
  // Note: Check ports as 9944 is used by Midnight Node by default in the lace wallet
  stopProcessAtPort: [9944, 7007],
  processes: [
    {
      name: ComponentNames.AVAIL_NODE,
      args: ["task", "-f", "@example/avail-contracts", "avail-node:start"],
      waitToExit: false,
      // logs: "none",
      type: "system-dependency",
    },
    {
      name: ComponentNames.AVAIL_CLIENT,
      args: [
        "task",
        "-f",
        "@example/avail-contracts",
        "avail-light-client:start",
      ],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.AVAIL_NODE_WAIT,
      args: ["task", "-f", "@example/avail-contracts", "avail-node:wait"],
    },
    {
      name: ComponentNames.AVAIL_CLIENT_WAIT,
      args: [
        "task",
        "-f",
        "@example/avail-contracts",
        "avail-light-client:wait",
      ],
    },
  ],
};
