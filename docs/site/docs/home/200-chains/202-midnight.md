# Midnight

Midnight is a privacy-focused ZK (Zero-Knowledge) blockchain. Effectstream integrates with Midnight to read public state changes resulting from private circuit execution.

Some key points about Midnight:
*   **Private State**: Keep user data and application logic confidential.
*   **Confidential Transactions**: Execute transactions without revealing their details on-chain.
*   **Verifiable Computation**: Run complex logic off-chain and prove its correct execution on-chain without revealing the inputs.

### How Midnight Works: An Overview

Midnight allows to keep the user's private and public data in the blockchain. The key components are, for understanding how it works:

*   **User & Wallet**: Interacts with the dApp. The wallet manages keys and signs transactions, but sensitive data never leaves the user's device.
*   **Proof Server**: A (local or remote) service that generates the ZK proofs required for transactions.
*   **Node**: The core blockchain client that validates transactions by verifying their ZK proofs and maintains the public ledger.
*   **Indexer**: A service that tracks the public blockchain data, making it easily queryable for dApps.
*   **Smart Contracts (Compact)**: Contracts are written in Compact, a language designed for ZK. They define private logic (circuits) and can expose a **public `ledger` state**.
*  **ledger**: The public state of the contract. It is the state that is exposed to the Effectstream.

### Effectstream & Midnight Integration

Effectstream acts as a powerful deterministic off-chain indexer and state machine that **monitors the public state** of Midnight contracts. It does not handle private data or proof generation. Instead, it observes the *results* of private computations that are made public on the Midnight ledger.

This allows you to build complex dApps that combine the privacy of Midnight with the multi-chain data aggregation and deterministic logic of Effectstream.

```mermaid
graph TD
    subgraph Effectstream
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

## 1. Configuration (Read)

### Network Definition
Define the connection to the Midnight node.

```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "midnight",
    type: ConfigNetworkType.MIDNIGHT,
    genesisHash: "0x...",
    networkId: 0, // 0 for local undeployed/devnet
    nodeUrl: "http://127.0.0.1:9944",
  })
)
```

### Sync Protocol
The protocol type `MIDNIGHT_PARALLEL` connects to the Midnight Indexer (GraphQL) to fetch state updates.

```ts
.addParallel(
  (networks) => networks.midnight,
  (network, deployments) => ({
    name: "parallelMidnight",
    type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    startBlockHeight: 1,
    pollingInterval: 1000,
    indexer: "http://127.0.0.1:8088/api/v1/graphql",
    indexerWs: "ws://127.0.0.1:8088/api/v1/graphql/ws",
  })
)
```

### Contract Development

*   **Language**: Compact (a TypeScript-inspired DSL for ZK).
*   **Compilation**: `deno task build:midnight`

A Midnight contract defines private state transitions (`circuits`) and can choose to expose certain data publicly in its `ledger`. Effectstream can only see what is in the public `ledger`.

**Example (`main.rs`):**
```rust
pragma language_version 0.16;

import CompactStandardLibrary;

// This is the public state that Effectstream's primitive will monitor.
export ledger round: Counter;

// This is a private state transition. When executed, it generates a ZK proof.
// Its effect is made visible to Paima by the change it causes to the public `round` state.
export circuit increment(): [] {
  round.increment(1);
}
```

### Primitives
*   **`PrimitiveTypeMidnightGeneric`**: Monitors the public `ledger` export of a Compact contract. Whenever a circuit modifies this public state, the primitive triggers.

```ts
import { PrimitiveTypeMidnightGeneric } from "@effectstream/sm/builtin";
import * as MyContract from "@my-project/midnight-contract/contract";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  (network, deployments, syncProtocol) => ({
    name: "MidnightGameState",
    type: PrimitiveTypeMidnightGeneric,
    contractAddress: "...",
    contract: { ledger: MyContract.ledger }, // The ledger definition from Compact compilation
    stateMachinePrefix: "midnight-state-change",
  })
)
```

## 2. Batcher Adapters (Write)

Writing to Midnight involves proving and submitting ZK circuits. Effectstream provides the `MidnightAdapter` to handle this complexity.

### Standard Midnight Adapter
The `MidnightAdapter` manages the ZK proof generation (via a proof server) and transaction submission.

```ts
import { MidnightAdapter } from "@effectstream/batcher";

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  walletSeed,
  {
    indexer: "...",
    node: "...",
    proofServer: "http://localhost:6300",
    zkConfigPath: "path/to/zk/config",
    privateStateStoreName: "my-app-store",
  },
  new MyContract.Contract(witnesses),
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "parallelMidnight"
);
```

The adapter uses `MidnightBatchBuilderLogic` to format inputs into circuit arguments compatible with the Compact runtime.

## 3. Orchestration

Use `launchMidnight` from `@effectstream/orchestrator/start-midnight` to launch the full stack:
*   Midnight Node
*   GraphQL Indexer
*   Proof Server
*   Contract Deployment

```ts
// in start.ts
processesToLaunch: [
  ...launchMidnight("@my-project/midnight-contracts"),
]
```

> NOTE: To use this launcher you need to implement some `deno task` in your project. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/midnight-contracts",
  ...
  "tasks": {
    "midnight-node:start": "CFG_PRESET=dev deno run -A --unstable-detect-cjs @effectstream/npm-midnight-node --dev --rpc-port 9944 --state-pruning archive --blocks-pruning archive --public-addr /ip4/127.0.0.1 --unsafe-rpc-external",
    "midnight-node:wait": "wait-on tcp:9944",
    "midnight-indexer:start": "RUST_BACKTRACE=1 LEDGER_NETWORK_ID=\"Undeployed\" SUBSTRATE_NODE_WS_URL=\"ws://localhost:9944\" APP__INFRA__SECRET=$(openssl rand -hex 32 | tr 'a-f' 'A-F') FEATURES_WALLET_ENABLED=\"true\" APP__INFRA__NODE__URL=\"ws://localhost:9944\" deno run -A --unstable-detect-cjs @effectstream/npm-midnight-indexer --binary --clean",
    "midnight-indexer:wait": "wait-on tcp:8088",
    "midnight-proof-server:start": "LEDGER_NETWORK_ID=\"Undeployed\" RUST_BACKTRACE=full SUBSTRATE_NODE_WS_URL=\"ws://localhost:9944\" deno run -A --unstable-detect-cjs @effectstream/npm-midnight-proof-server",
    "midnight-proof-server:wait": "wait-on tcp:6300",
    "midnight-contract:clean": "rm -rf midnight-level-db contract-eip-20.json contract-counter.json",
    "midnight-contract:deploy": "deno task midnight-contract:clean && deno task contract-eip20:deploy && deno task contract-counter:deploy",
    "contract-counter:deploy": "deno --unstable-detect-cjs -A contract-counter-deploy.ts",
    "contract-eip20:deploy": "deno --unstable-detect-cjs -A contract-eip-20-deploy.ts"
  }
}
```