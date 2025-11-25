# Supported Chains

Effectstream is chain-agnostic. It can connect to, monitor, and write to multiple blockchains simultaneously.

*   [**EVM**](./201-evm.md): Ethereum, Arbitrum, Optimism, Polygon, and other EVM-compatible chains.
*   [**Midnight**](./202-midnight.md): Privacy-focused ZK chain for confidential smart contracts.
*   [**Cardano**](./203-cardano.md): UTXO-based blockchain using Ouroboros proof-of-stake.
*   [**Avail**](./204-avail.md): Data Availability (DA) layer for scalable rollups.
*   [**Bitcoin**](./205-bitcoin.md): The original UTXO blockchain.

Each chain integration consists of two parts:
1.  **Read (Sync Service)**: Configuring the node to listen for specific events or state changes.
2.  **Write (Batcher)**: Configuring adapters to submit transactions back to the chain.