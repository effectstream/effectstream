import { ComponentNames } from "@effectstream/log";
import { ENV } from "@effectstream/utils/node-env";


// Substrate nodes (and many forks like Avail and Midnight) use the Rust tracing/log
// stack wired through sc-cli/sc-service, which by default writes formatted log output to stderr.
// This is intentional so stdout can remain a clean data channel (e.g., for RPC JSON),
// while human-readable logs go to stderr. For E2E testing, we want to disable this,
// unless the user explicitly wants to see the logs, so if EFFECTSTREAM_STDOUT is true,
// we enable stderr for this as well.

const disableStderr = (typeof process !== "undefined" ? process.env?.EFFECTSTREAM_STDOUT : (typeof Deno !== "undefined" ? (Deno as any).env?.get?.("EFFECTSTREAM_STDOUT") : undefined)) === "true" ? false : true;

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
export const launchMidnight = (packageName: string): {
  stopProcessAtPort?: number[];
  name: string;
  args: string[];
  waitToExit?: boolean;
  logs?: string;
  logsStartDisabled?: boolean;
  disableStderr?: boolean;
  type?: string;
  dependsOn?: string[];
  env?: Record<string, string>;
}[] => [
    {
      stopProcessAtPort: [9944, 8088, 6300, 30333],
      name: ComponentNames.MIDNIGHT_NODE,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-node:start",
      ],
      waitToExit: false,
      type: "system-dependency",
      logsStartDisabled: true,
      disableStderr,
      logs: "raw",
      dependsOn: [],
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
      logsStartDisabled: true,
      disableStderr,
      logs: "raw",
      dependsOn: [ComponentNames.MIDNIGHT_NODE],
    },
    {
      name: ComponentNames.MIDNIGHT_PROOF_SERVER,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-proof-server:start",
      ],
      logsStartDisabled: true,
      waitToExit: false,
      type: "system-dependency",
      dependsOn: [ComponentNames.MIDNIGHT_NODE]
    },
    {
      name: ComponentNames.MIDNIGHT_NODE_WAIT,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-node:wait",
      ],
      dependsOn: [ComponentNames.MIDNIGHT_NODE],
    },
    {
      name: ComponentNames.MIDNIGHT_INDEXER_WAIT,
      args: [
        "task",
        "-f",
        packageName,
        "midnight-indexer:wait",
      ],
      dependsOn: [ComponentNames.MIDNIGHT_INDEXER],
    },
    {
      name: ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
      logs: "raw",
      args: [
        "task",
        "-f",
        packageName,
        "midnight-proof-server:wait",
      ],
      dependsOn: [ComponentNames.MIDNIGHT_PROOF_SERVER],
    },
    {
      name: ComponentNames.MIDNIGHT_CONTRACT,
      // logs: "raw",
      args: [
        "task",
        "-f",
        packageName,
        "midnight-contract:deploy",
      ],
      env: {
        MIDNIGHT_STORAGE_PASSWORD: ENV.MIDNIGHT_STORAGE_PASSWORD,
      },
      dependsOn: [
        ComponentNames.MIDNIGHT_NODE_WAIT,
        ComponentNames.MIDNIGHT_INDEXER_WAIT,
        ComponentNames.MIDNIGHT_PROOF_SERVER_WAIT,
      ],
    },
  ];
