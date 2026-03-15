import { ComponentNames } from "@effectstream/log";

// Start Cardano Node and Indexer.
//
// This is a example launcher for Cardano Chains and Contracts.
// Working implementation examples are provided in the /templates/* folders.
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
export const launchCardano = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
  cwd?: string;
  command?: string;
}[] => {

 return [
    {
      stopProcessAtPort: [8090, 10000, 50051, 3001],
      name: ComponentNames.YACI_DEVKIT,
      args: ["task", "-f", packageName, "devkit:start"],
      waitToExit: false,
      type: "system-dependency",
      logsStartDisabled: true,
    },
    {
      name: ComponentNames.YACI_DEVKIT_WAIT,
      args: ["run", "--filter", packageName, "devkit:wait"],
      // dependsOn: [ComponentNames.YACI_DEVKIT],
    },
    {
      name: ComponentNames.DOLOS_FILL_TEMPLATE,
      args: ["task", "-f", packageName, "dolos:fill-template"],
      waitToExit: true,
      dependsOn: [ComponentNames.YACI_DEVKIT_WAIT],
    },
    {
      name: ComponentNames.DOLOS,
      args: ["run", "--filter", packageName, "dolos:start"],
      waitToExit: false,
      logs: "raw",
      logsStartDisabled: true,
      disableStderr: true,
      type: "system-dependency",
      dependsOn: [ComponentNames.DOLOS_FILL_TEMPLATE],
    },
    {
      name: ComponentNames.DOLOS_WAIT,
      args: ["run", "--filter", packageName, "dolos:wait"],
      dependsOn: [ComponentNames.DOLOS],
    },
  ];
}