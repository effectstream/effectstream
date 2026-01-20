import { ComponentNames } from "@effectstream/log";

// Substrate nodes (and many forks like Avail and Midnight) use the Rust tracing/log
// stack wired through sc-cli/sc-service, which by default writes formatted log output to stderr.
// This is intentional so stdout can remain a clean data channel (e.g., for RPC JSON),
// while human-readable logs go to stderr. For E2E testing, we want to disable this,
// unless the user explicitly wants to see the logs, so if EFFECTSTREAM_STDOUT is true,
// we enable stderr for this as well.

const disableStderr = process.env.EFFECTSTREAM_STDOUT === "true" ? false : true;

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
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
}[] => [
    {
      stopProcessAtPort: [9955, 7007, 30333],
      name: ComponentNames.AVAIL_NODE,
      args: ["--filter", packageName, "avail-node:start"],
      waitToExit: false,
      logs: "raw",
      logsStartDisabled: true,
      disableStderr,
      type: "system-dependency",
    },
    {
      name: ComponentNames.AVAIL_NODE_WAIT,
      args: ["--filter", packageName, "avail-node:wait"],
      dependsOn: [ComponentNames.AVAIL_NODE],
    },
    {
      name: ComponentNames.AVAIL_CLIENT,
      args: [
        "--filter",
        packageName,
        "avail-light-client:deploy",
      ],
      waitToExit: false,
      disableStderr,
      logsStartDisabled: true,
      type: "system-dependency",  
      dependsOn: [ComponentNames.AVAIL_NODE_WAIT],
      logs: "raw",
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
