# Supported Chains

EffectStream is chain-agnostic. It can connect to, monitor, and write to multiple blockchains simultaneously.

*   [**EVM**](./201-evm.md): Ethereum, Arbitrum, Optimism, Polygon, and other EVM-compatible chains.
*   [**Midnight**](./202-midnight.md): Privacy-focused ZK chain for confidential smart contracts.
*   [**Cardano**](./203-cardano.md): UTXO-based blockchain using Ouroboros proof-of-stake.
*   [**Avail**](./204-avail.md): Data Availability (DA) layer for scalable rollups.
*   [**Bitcoin**](./205-bitcoin.md): The original UTXO blockchain.
*   [**Polkadot**](./206-polkadot.md): Polkadot relay chain and Substrate-based parachains.
*   [**Mina**](./207-mina.md): The lightweight ZK blockchain.
*   [**Algorand**](./208-algorand.md): Pure Proof-of-Stake blockchain.
*   [**Celestia**](./209-celestia.md): Modular Data Availability (DA) layer for blob storage.

Each chain integration can contain up to 4 parts:
1.  **Read (Sync Service)**: Configuring the node to listen for specific events or state changes.
2.  **Write (Batcher)**: Configuring adapters to submit transactions back to the chain.
3.  **Connect (Wallets & Cryptography)**: Connecting user wallets in the frontend to sign messages and transactions.

4. **Orchestration (Processes)**: Tools for spinning up a local node, indexer, etc, and deploying contracts automatically.

## Feature Support Matrix

| Chain | Read Chain (Sync) | Write Chain (Batcher) | Local Node (Orchestrator) | Browser Wallet |
| :--- | :---: | :---: | :---: | :---: |
| [**EVM**](./201-evm.md) | ✅ | ✅ | ✅ | ✅ |
| [**Midnight**](./202-midnight.md) | ✅ | ✅ | ✅ | ✅ |
| [**Cardano**](./203-cardano.md) | ✅ | ✅ | ✅ | ✅ |
| [**Avail**](./204-avail.md) | ✅ | ✅ | ✅ | ✅ |
| [**Bitcoin**](./205-bitcoin.md) | ✅ | ✅ | ✅ | ⚠️ |
| [**Polkadot**](./206-polkadot.md) | ⚠️ | ⚠️ | ⚠️ | ✅ |
| [**Mina**](./207-mina.md) | ⚠️ | ⚠️ | ⚠️ | ✅ |
| [**Algorand**](./208-algorand.md) | ⚠️ | ⚠️ | ⚠️ | ✅ |
| [**Celestia**](./209-celestia.md) | ✅ | ✅ | ✅ | ⚠️ |

> ✅ **Available** | ⚠️ **Partial or not built-in**


## Cryptography & Verification

EffectStream provides a unified package, `@effectstream/crypto`, to handle the complexities of different cryptographic standards (ECDSA, Ed25519, Schnorr, etc.).

Instead of installing specific SDKs for every chain (e.g., `ethers`, `lucid`, `polkadot-js`), you can use the `CryptoManager` singleton. This is particularly useful inside **State Transition Functions (STFs)** to verify that a user action was authorized by a specific wallet.

```ts
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

// Generic verification using AddressType enum
const crypto = CryptoManager.getCryptoManager(AddressType.EVM);

// 1. Verify Address Format
const isValid = crypto.verifyAddress(userAddress);

// 2. Verify Some Signed Message
const isAuthorized = await crypto.verifySignature(userAddress, message, signature);
```