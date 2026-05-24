# Overview

The Batcher is a production-ready service for aggregating and batching user transactions across multiple blockchains. It provides a unified HTTP API for submitting inputs while abstracting away blockchain-specific complexity through a pluggable adapter system.

## Quick Start

Get started quickly with these essential guides:

- **[Introduction](./1210-introduction.md)** - Overview and architecture
- **[Core Concepts](./1220-core-concepts.md)** - Understanding the building blocks
- **[Configuration](./1240-configuration.md)** - Setting up your batcher
- **[The Batching Pipeline](./1230-batching-pipeline.md)** - How inputs flow through the system

## Key Features

### 🔗 Multi-Chain Support
Batch transactions for multiple blockchains simultaneously. Each blockchain gets its own adapter with independent batching rules and configuration.

### 🔄 Flexible Batching Strategies
Configure when batches are submitted using time-based, size-based, value-based, hybrid, or custom criteria-independently per blockchain.

### 💾 Crash-Safe Storage
All inputs are persisted immediately to storage (file, PostgreSQL, Redis, or custom). No in-memory queues that can be lost on restart.

### 🔌 Pluggable Architecture
- **Adapters**: Add support for new blockchains by implementing the `BlockchainAdapter` interface
- **Storage**: Use any backend by implementing the `BatcherStorage` interface
- **Criteria**: Define custom batching logic with user-defined functions

### 📊 Production-Ready
- RESTful HTTP API with OpenAPI documentation
- Event system for monitoring and observability
- Graceful shutdown with configurable hooks
- Structured concurrency using Effection

## Architecture Overview

```
┌─────────────┐
│ HTTP Client │
└──────┬──────┘
       │ POST /send-input
       ▼
┌──────────────────────────────────┐
│     Batcher Core           │
│  - Validation                    │
│  - Storage Persistence           │
│  - Batching Criteria Check       │
└────────┬─────────────────────────┘
         │
    ┌────┴─────┬──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│EVM     │ │Midnight│ │Custom  │
│Adapter │ │Adapter │ │Adapter │
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Ethereum│ │Midnight│ │Custom  │
│Chain   │ │Network │ │Chain   │
└────────┘ └────────┘ └────────┘
```

## Documentation Structure

### Getting Started
- **[Introduction](./1210-introduction.md)** - What is the Batcher and why use it?
- **[Core Concepts](./1220-core-concepts.md)** - Key abstractions: `Batcher`, `BlockchainAdapter`, `Target`, `DefaultBatcherInput`

### Configuration & Setup
- **[Configuration](./1240-configuration.md)** - Complete setup guide with dynamic and unified configuration approaches
- **[The Batching Pipeline](./1230-batching-pipeline.md)** - Understanding the input lifecycle from submission to confirmation

### Customization
- **[Custom Adapters](./1250-adapter.md)** - Implementing `BlockchainAdapter` for new blockchains
- **[Advanced Topics](./1290-advanced-topics.md)** - HTTP API, batching criteria, event system, storage backends, and Effection integration

## Common Use Cases

### Multi-Chain Gaming
Batch player actions across multiple chains with different batching rules per chain.

```typescript
batcher
  .addBlockchainAdapter("ethereum", ethAdapter, {
    criteriaType: "hybrid",
    timeWindowMs: 5000,    // 5 seconds max wait
    maxBatchSize: 50        // or 50 moves
  })
  .addBlockchainAdapter("polygon", polygonAdapter, {
    criteriaType: "time",
    timeWindowMs: 1000      // Submit every second (cheaper gas)
  });
```

### Financial Applications
Batch payments when accumulated value reaches a threshold.

```typescript
batcher.addBlockchainAdapter("payments", paymentsAdapter, {
  criteriaType: "value",
  valueAccumulatorFn: (input) => input.amount,
  targetValue: 100000  // Batch when $1000 accumulated
});
```

### NFT Minting
Process mints in batches based on queue size.

```typescript
batcher.addBlockchainAdapter("nft", nftAdapter, {
  criteriaType: "size",
  maxBatchSize: 20  // Mint 20 NFTs per batch
});
```

## Example: Complete Setup

```typescript
import { main, suspend } from "effection";
import { Batcher, FileStorage, EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";

// 1. Create adapter
const adapter = new EffectstreamL2DefaultAdapter(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",  // Contract address
  process.env.PRIVATE_KEY!,                       // Private key
  0n,                                              // Fee
  "mainEvmRPC"                                     // Sync protocol name
);

// 2. Create batcher
const batcher = new Batcher({
  pollingIntervalMs: 1000,
  port: 3334,
  enableHttpServer: true,
  enableEventSystem: true,
  adapters: {}  // Start empty, add dynamically
}, new FileStorage("./batcher-data"));

// 3. Wire adapter with criteria
batcher.addBlockchainAdapter("ethereum", adapter, {
  criteriaType: "hybrid",
  timeWindowMs: 5000,
  maxBatchSize: 50
}).setDefaultTarget("ethereum");

// 4. Add monitoring
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`🚀 Batcher started on port ${publicConfig.port}`);
});

batcher.addStateTransition("batch:submit", ({ txHash }) => {
  console.log(`🚀 Batch submitted: ${txHash}`);
});

// 5. Run with Effection
main(function* () {
  yield* batcher.runBatcher();
  yield* suspend();
});
```

## API Endpoints

Once running, the batcher exposes these HTTP endpoints:

- `POST /send-input` - Submit a new input
- `GET /status` - Batcher status and configuration
- `GET /queue-stats` - Queue statistics per target
- `GET /health` - Health check
- `POST /force-batch` - Manually trigger batching (dev)
- `GET /documentation` - Interactive OpenAPI docs

See [HTTP API](./1290-advanced-topics.md#http-api) for complete documentation.

## Next Steps

Choose your path:

**I'm new to the batcher:**
1. Read [Introduction](./1210-introduction.md)
2. Understand [Core Concepts](./1220-core-concepts.md)
3. Follow [Configuration Guide](./1240-configuration.md)

**I want to customize:**
1. Learn [The Batching Pipeline](./1230-batching-pipeline.md)
2. Implement [Custom Adapters](./1250-adapter.md)
3. Explore [Advanced Topics](./1290-advanced-topics.md)

**I'm ready to deploy:**
1. Review [Configuration](./1240-configuration.md)
2. Set up [Event System](./1290-advanced-topics.md#event-system) for monitoring
3. Configure [Storage](./1290-advanced-topics.md#storage-system) for production

