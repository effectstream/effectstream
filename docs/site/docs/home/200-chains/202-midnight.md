# Midnight

Midnight is a **privacy-focused blockchain** that uses Zero-Knowledge Proofs (ZKPs) to enable secure, confidential decentralized applications. Integrating Midnight allows your Paima dApp to leverage powerful privacy features, such as:
*   **Private State**: Keep user data and application logic confidential.
*   **Confidential Transactions**: Execute transactions without revealing their details on-chain.
*   **Verifiable Computation**: Run complex logic off-chain and prove its correct execution on-chain without revealing the inputs.

### How Midnight Works: An Overview

Midnight's architecture is modular, separating the user's private data from the public blockchain. The key components are:

*   **User & Wallet**: Interacts with the dApp. The wallet manages keys and signs transactions, but sensitive data never leaves the user's device.
*   **Proof Server**: A local service that generates the ZK proofs required for private transactions.
*   **Node**: The core blockchain client that validates transactions by verifying their ZK proofs and maintains the public ledger.
*   **Indexer**: A service that tracks the public blockchain data, making it easily queryable for dApps.
*   **Smart Contracts (Compact)**: Contracts are written in Compact, a language designed for ZK. They define private logic (circuits) and can expose a **public `ledger` state**.

### Statestream's Role in the Midnight Ecosystem

Statestream acts as a powerful off-chain indexer and state machine that **monitors the public state** of Midnight contracts. It does not handle private data or proof generation. Instead, it observes the *results* of private computations that are made public on the Midnight ledger.

This allows you to build complex dApps that combine the privacy of Midnight with the multi-chain data aggregation and deterministic logic of Statestream.

```mermaid
graph TD
    subgraph Statestream
        PaimaSync[Sync Service] --> PaimaSM[State Machine]
    end

    subgraph User's Machine
        A[User/Frontend] --> B{Wallet};
        B --> C[Proof Server];
    end

    subgraph Midnight Network
        D[Midnight Node] --> E[Indexer];
    end

    C -- ZK Proof --> B;
    B -- Signed TX with Proof --> D;
    E -- Fetches Public State --> PaimaSync;

   
```

### Configuration

Connecting Statestream to a Midnight network is a two-step process in your `config.ts` file.

*   **Network Definition (`buildNetworks`)**:
    First, you define the connection details for the Midnight network.
    ```ts
    .buildNetworks(builder =>
      builder.addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        genesisHash: "0x...",
        networkId: 0, // 0 for local test node
        nodeUrl: "http://127.0.0.1:9944",
      })
    )
    ```

*   **Sync Protocol Definition (`buildSyncProtocols`)**:
    Next, you tell the engine *how* to sync from Midnight by adding a `MIDNIGHT_PARALLEL` protocol. This protocol connects to the **Midnight Indexer** to efficiently query for state changes.
    ```ts
    .addParallel(
      (networks) => networks.midnight,
      (network, deployments) => ({
        name: "parallelMidnight",
        type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
        startBlockHeight: 1,
        pollingInterval: 1000,
        indexer: "http://127.0.0.1:8088/api/v1/graphql",
      }),
    )
    ```

### Supported Primitives

*   **`MidnightContractState`**: This is the primary primitive for Midnight. Unlike EVM primitives that listen for events, this one monitors the **public `ledger` state** of a ZK contract. When a private transaction causes a change to this public state, the primitive triggers and sends the updated state data to your State Transition Function (STF).

### Contract Development

*   **Language**: Compact (a TypeScript-inspired DSL for ZK).
*   **Compilation**: `deno task build:midnight`

A Midnight contract defines private state transitions (`circuits`) and can choose to expose certain data publicly in its `ledger`. Statestream can only see what is in the public `ledger`.

**Example (`main.rs`):**
```rust
pragma language_version 0.16;

import CompactStandardLibrary;

// This is the public state that Statestream's primitive will monitor.
export ledger round: Counter;

// This is a private state transition. When executed, it generates a ZK proof.
// Its effect is made visible to Paima by the change it causes to the public `round` state.
export circuit increment(): [] {
  round.increment(1);
}
```

### Local Development Setup
The `launchMidnight` function (`@paima/orchestrator/start-midnight`) automates your entire local Midnight environment. When included in your `orchestrator.ts`, it will start the Midnight local node, the indexer, the proof server, and any other necessary services, ensuring a seamless development experience.

This is the example launcher for Midnight for the [Process Orchestrator](../100-components/106-processes.md)
Normally this should be enough for must use cases, but you can edit it to your own need.s
```ts
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
      logs: "none",
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

```