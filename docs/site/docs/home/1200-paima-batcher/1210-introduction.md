# Introduction to the Paima Batcher

Welcome to the Paima Batcher, a powerful and flexible service designed to solve the complex problem of transaction batching in a multi-chain environment.

## What is the Paima Batcher?

The Paima Batcher is a standalone service that acts as a robust, chain-agnostic ingestion point for user inputs. Its primary job is to:

1. Receive inputs via a simple HTTP API.
2. Validate these inputs using chain-specific logic.
3. Queue and collect valid inputs.
4. Batch them into a single, optimized transaction.
5. Submit that transaction to the target blockchain.

This service abstracts away the complexity of managing private keys, nonces, gas fees, and transaction confirmation logic, providing your application with a single, reliable endpoint for submitting data.

## The Core Problem: Multi-Chain Abstraction

In a multi-chain application (e.g., one that interacts with both an EVM chain and Midnight), batching logic is notoriously difficult. Each chain has a different:
- Input format (e.g., EVM function calls vs. Midnight circuit arguments).
- Transaction building process.
- Signature verification method.
- Transaction Confirmation and receipt-handling mechanism.

Writing a single service that can handle all of this is complex and error-prone.

### Adapter-Driven Architecture

The Paima Batcher solves this problem with a flexible, plugin-based architecture. The core batcher service itself knows nothing about any specific blockchain.

Instead, all chain-specific logic is delegated to a `BlockchainAdapter`. A `BlockchainAdapter` is a "driver" you provide for a specific chain target (e.g., `"evm"` or `"midnight"`). This adapter is responsible for all chain-specific tasks:
- Validating an input's data structure.
- Verifying a user's signature.
- Building a valid batch payload from a list of inputs.
- Submitting the final transaction to the node.
- Waiting for the transaction to be confirmed.

This design (seen in `adapter.ts` and implemented in `paimal2-adapter.ts` and `midnight-adapter.ts`) means the core batcher simply orchestrates the flow, making the system incredibly flexible. To add support for a new chain, you simply write a new adapter—no need to modify the batcher's core logic.