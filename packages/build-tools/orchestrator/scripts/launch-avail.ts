import { ComponentNames } from "@effectstream/log";

// Start Avail Node and Light Client.
//
// This is a example launcher for Avail Chains and Contracts.
// Working implementation examples are provided in the /templates/* folders.
// Normally you would not need to modify this file.
//
// Note: Check ports as 9944 is used by Midnight Node by default in the lace wallet
//
// This file requires you to provide a workspace package with the following tasks:
//
// avail-node:start: start the avail node
// avail-light-client:start: start the avail light client
// avail-node:wait: wait for the avail node to start
// avail-light-client:wait: wait for the avail light client to start
//
// packageName: the name of the package that implements the tasks.
//
export const launchAvail = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  type?: string;
  dependsOn?: string[];
}[] => [
    {
      stopProcessAtPort: [9955, 7007],
      name: ComponentNames.AVAIL_NODE,
      args: ["task", "-f", packageName, "avail-node:start"],
      waitToExit: false,
      logs: "raw",
      type: "system-dependency",
    },
    {
      name: ComponentNames.AVAIL_NODE_WAIT,
      args: ["task", "-f", packageName, "avail-node:wait"],
      dependsOn: [ComponentNames.AVAIL_NODE],
    },
    {
      name: ComponentNames.AVAIL_CLIENT,
      args: [
        "task",
        "-f",
        packageName,
        "avail-light-client:deploy",
      ],
      waitToExit: false,
      type: "system-dependency",  
      dependsOn: [ComponentNames.AVAIL_NODE_WAIT],
    },
    {
      name: ComponentNames.AVAIL_CLIENT_WAIT,
      args: [
        "task",
        "-f",
        packageName,
        "avail-light-client:wait",
      ],
      dependsOn: [ComponentNames.AVAIL_CLIENT],
    },
  ];
