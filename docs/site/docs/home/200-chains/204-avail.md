# Avail

Avail is not a traditional smart contract platform, but a specialized **Data Availability (DA) Layer**. Its primary purpose is to provide a cheap, secure, and decentralized place to post data. For Effectstream, it can act as an alternative to an L1 for storing the input data for your rollup, potentially leading to much lower "gas" costs.

## Configuration

*   **Network Definition (`buildNetworks`)**:
    ```ts
    .buildNetworks(builder =>
      builder.addNetwork({
        name: "avail",
        type: ConfigNetworkType.AVAIL,
        // ... avail specific configuration
      })
    )
    ```

*   **Sync Protocol Definition (`buildSyncProtocols`)**:
    The `AVAIL_PARALLEL` protocol connects to an Avail light client to fetch application-specific data blobs.
    ```ts
    .addParallel(
      (networks) => networks.avail,
      (network, deployments) => ({
        name: "parallelAvail",
        type: ConfigSyncProtocolType.AVAIL_PARALLEL,
        // ... config for the avail light client
      }),
    )
    ```

## Supported Primitives
> TODO: Clarify the specific primitives for Avail. The primary interaction is likely reading raw data blobs associated with a specific Paima application ID, rather than tracking structured events like with EVM.

## Contract Development
Avail is not designed for complex, general-purpose smart contracts. Its main function is data submission and verification.

## Local Development Setup
The `launchAvail` function (`@effectstream/orchestrator/start-avail`) can be used to spin up a local Avail node and the necessary light client for local testing.