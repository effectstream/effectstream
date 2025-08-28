# Midnight

Midnight is a Zero-Knowledge (ZK) powered blockchain designed for privacy and verifiable computation. Integrating with Midnight allows your Paima dApp to incorporate private state, confidential transactions, and complex logic that would be too expensive or impossible to run on a public chain.

## Configuration

*   **Network Definition (`buildNetworks`)**:
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
    The protocol type is `MIDNIGHT_PARALLEL`, which connects to a Midnight Indexer service.
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

## Supported Primitives

*   **`MidnightContractState`**: The primary primitive for Midnight. It does not watch for events, but instead monitors the public **`ledger` state** of a ZK contract. When this public state changes, the primitive triggers and sends the updated state to your STF.

## Contract Development
*   **Language**: A specialized, Rust-like language for writing ZK circuits.
*   **Compilation**: `deno task build:midnight`

## Local Development Setup
The `launchMidnight` function (`@paima/orchestrator/start-midnight`) orchestrates your local Midnight environment. It typically starts the Midnight local node, the indexer, and other necessary services.