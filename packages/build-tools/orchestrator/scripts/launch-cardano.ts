import { ComponentNames } from "@paima/log";

// Start Cardano Node and Indexer.
//
// This is a example launcher for Cardano Chains and Contracts.
// Working implementation examples are provided in the example-projects.
// Normally you would not need to modify this file.
//
// This file requires you to provide a workspace package with the following tasks:
//
// devkit:start: start the yaci-devkit node
// devkit:wait: wait for the yaci-devkit node to start
// dolos:start: start the dolos node
// dolos:wait: wait for the dolos node to start
//
// packageName: the name of the package that implements the tasks.
//
export const launchCardano = (packageName: string) => ({
  stopProcessAtPort: [8090, 10000, 50051, 3001],
  processes: [
    {
      name: ComponentNames.YACI_DEVKIT,
      args: ["task", "-f", packageName, "devkit:start"],
      waitToExit: false,
      logs: "otel-compatible",
      type: "system-dependency",
    },
    {
      name: ComponentNames.YACI_DEVKIT_WAIT,
      args: ["task", "-f", packageName, "devkit:wait"],
    },
    {
      name: ComponentNames.DOLOS,
      args: ["task", "-f", packageName, "dolos:start"],
      waitToExit: false,
      type: "system-dependency",
    },
    {
      name: ComponentNames.DOLOS_WAIT,
      args: ["task", "-f", packageName, "dolos:wait"],
    },
  ],
});
