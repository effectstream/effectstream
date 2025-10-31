# Process Orchestrator

Developing a multi-chain dApp is complex. It often requires running multiple local blockchains, indexers, deploying contracts, and managing various services simultaneously. Doing this manually is tedious, error-prone, and slows down development.

The **Process Orchestrator** is a powerful tool built into Statestream that solves this problem. It automates the setup of your entire local development environment. When you run `deno task dev` in the `/templates/evm-midnight/` example, the orchestrator reads a configuration file (`start.ts`) and launches all the necessary processes—from blockchains and databases to the batcher and frontend server—in the correct order.

Its main goal is to create a complete, "mini-production" environment on your machine, so you can focus on building your dApp, not on managing infrastructure.

### How It Works

The orchestrator is the main entry point for your development environment. When started, it performs the following steps:

1.  **Reads `start.ts`**: It loads your configuration, which defines all the processes to run.
2.  **Launches Dependencies**: It starts foundational services like local blockchains (EVM, Midnight, etc.) and the development database. It can be configured to wait for each process to be ready before proceeding to the next step.
3.  **Deploys Contracts**: Once the chains are running, it executes your deployment scripts.
4.  **Starts Paima Services**: It launches core Paima services like the Batcher and the log collector.
5.  **Starts the Sync Service**: Once the entire environment is successfully set up, the orchestrator starts the main **Paima Sync Service**. The Sync Service then loads its own configuration (`config.ts`) and begins the actual process of syncing blockchain data and running your state machine.

### Configuring the Orchestrator (`orchestrator.ts`)

Your entire development environment is defined in a single configuration object. Let's break down its main components.

#### 1. Built-in Paima Services (`processes`)

This section is a set of boolean flags to enable or disable core Paima development services.

```ts
const config = Value.Parse(OrchestratorConfig, {
  processes: {
    // Starts an in-memory PostgreSQL database for development.
    [ComponentNames.PAIMA_PGLITE]: true,

    // Starts a local OpenTelemetry collector to aggregate logs.
    [ComponentNames.COLLECTOR]: true,

    // Starts the Batcher service.
    [ComponentNames.PAIMA_BATCHER]: true,
  },
  // ...
});
```

#### 2. Custom Process Groups (`processesToLaunch`)

This is where you define the custom tasks needed to set up your specific dApp environment. It's an array of process "groups," where each group can contain one or more sequential steps.

This is commonly used to:
*   Start a local blockchain.
*   Wait for the chain to be ready.
*   Deploy your smart contracts.
*   Build and run a frontend application.

> IMPORTANT: Example EVM / Midnight / Cardano / Avail examples are available in the @paima/orchestrator package

```
import { launchAvail } from "@paima/orchestrator/start-avail";
import { launchCardano } from "@paima/orchestrator/start-cardano";
import { launchEvm } from "@paima/orchestrator/start-evm";
import { launchMidnight } from "@paima/orchestrator/start-midnight";
```

But you can write your own, here is an example of a reusable launcher function for an EVM chain. Notice how it defines a sequence of processes.

```ts
// This function returns a configuration object for a process group.
export const launchEvm = (packageName: string) => [
  {
    stopProcessAtPort: [8545, 8546],
    name: ComponentNames.HARDHAT,
    args: ["task", "-f", packageName, "chain:start"],
    waitToExit: false,
    logs: "otel-compatible",
    type: "system-dependency",
    dependsOn: [],
  },
  {
    name: ComponentNames.HARDHAT_WAIT,
    args: ["task", "-f", packageName, "chain:wait"],
    dependsOn: [ComponentNames.HARDHAT],
  },
  {
    name: ComponentNames.DEPLOY_EVM_CONTRACTS,
    args: ["task", "-f", packageName, "deploy"],
    type: "system-dependency",
    dependsOn: [ComponentNames.HARDHAT_WAIT],
  },
];
```

This demonstrates the key property of `waitToExit`, which allows you to define dependencies between steps.

### Full Example Walkthrough

Let's look at the complete `start.ts` example. It sets up a complex, multi-chain environment.

```ts
// This file is the entry point for `deno task dev`
import { OrchestratorConfig, start } from "@paima/orchestrator";
// ... other imports

const config = Value.Parse(OrchestratorConfig, {
  // Section 1: Enable built-in services
  processes: {
    [ComponentNames.PAIMA_PGLITE]: true, // Use the dev database
    [ComponentNames.COLLECTOR]: true,   // Use the log collector
  },

  // Section 2: Define custom launch sequences
  processesToLaunch: [
    // Group A: Launch EVM, wait, and deploy contracts
    ...launchEvm("@e2e/evm-contracts"),

    // Group B: Launch Cardano stack
    ...launchCardano("@e2e/cardano-contracts"),

    // Group C: Launch Midnight stack
    ...launchMidnight("@e2e/midnight-contracts"),

    // Group D: Build and serve the frontend explorer
    //          Manually defined process. 
    {
      name: "build explorer",
      args: ["task", "-f", "@paima/explorer", "build"],
      waitToExit: true, // Wait for the build to finish...
    },
    {
      name: "serve explorer",
      args: ["task", "-f", "@paima/explorer", "server:start"],
      waitToExit: false, // ...then start the server and let it run.
      dependsOn: ["build explorer"],
    },
  ],
});

// Start the entire process
await start(config);
```