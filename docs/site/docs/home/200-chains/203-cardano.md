# Cardano

Cardano is a proof-of-stake blockchain known for its unique EUTXO (Extended Unspent Transaction Output) model and its focus on security and academic rigor. Integrating with Cardano allows your dApp to leverage its native assets and community.

## Configuration

Paima supports connecting to Cardano via different indexer services.

*   **Network Definition (`buildNetworks`)**:
    ```ts
    .buildNetworks(builder =>
      builder.addNetwork({
        name: "cardano",
        type: ConfigNetworkType.CARDANO,
        network: "yaci", // Or "preview", "mainnet", etc.
      })
    )
    ```

*   **Sync Protocol Definition (`buildSyncProtocols`)**:
    You can choose the protocol based on your indexer setup.
    *   **`CARDANO_CARP_PARALLEL`**: Connects using a [Carp](https://dcspark.github.io/carp/docs/intro) indexer.
    *   **`CARDANO_UTXORPC_PARALLEL`**: Connects using a [UTXO-RPC](https://www.utxorpc.org/) compatible service like Dolos (provided by Yaci Devkit).

## Supported Primitives
> TODO: Add a definitive list of Paima v2 Cardano primitives, such as tracking native assets, stake delegation changes, and specific transaction metadata.

## Contract Development
*   **Languages**: Plutus, Aiken, and others.
*   **Note**: Cardano contract development is an external process. Statestream integrates with your *deployed* Cardano contracts by monitoring on-chain activity.

## Local Development Setup
The `launchCardano` function (`@paima/orchestrator/start-cardano`) typically starts a local Cardano node and the Yaci Devkit, which provides a UTXO-RPC endpoint for local development.