# Batcher

A blockchain batching system for aggregating and submitting user inputs to
multiple chains.

## Features

- **Crash-safe batching** - Storage is the single source of truth; no in-memory
  pools that can be lost on restart
- **Pluggable storage** - Use files, PostgreSQL, Redis, or any backend by
  implementing `BatcherStorage`
- **Multi-chain support** - Abstract away blockchain differences through custom
  adapters
- **Flexible batching strategies** - Configure when to submit batches (time,
  size, value, or custom logic)
- **Structured concurrency** - Uses Effection for automatic resource cleanup and
  graceful cancellation
- **Event-driven observability** - Hook into batch lifecycle events for logging,
  monitoring, and custom behavior

## Quick Start

Here's a minimal example based on the E2E test setup:

### 1. Configure the Batcher

```typescript
import {
  FileStorage,
  BatcherConfig,
  EffectstreamL2DefaultAdapter,
} from "@effectstream/batcher";

// Create an adapter for your blockchain
const effectstreamL2 = new EffectstreamL2DefaultAdapter(
  "0x...", // Contract address
  "0x...", // Private key
  0n, // Fee
  "parallelEvmRPC_fast", // Sync protocol name
);

// Configure the batcher
const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  enableHttpServer: true,
  confirmationLevel: "wait-effectstream-processed",
  enableEventSystem: true,
  port: 3334,
};

const storage = new FileStorage("./batcher-data");
```

### 2. Run with Effection

```typescript
import { main, suspend } from "effection";
import { createNewBatcher } from "@effectstream/batcher";

const batcher = createNewBatcher(config, storage);

batcher
  .addBlockchainAdapter("effectstream-l2", effectstreamL2Adapter, { criteriaType: "time", timeWindowMs: 1000 })
// Add custom startup logging
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(
    `🚀 Batcher started - polling every ${publicConfig.pollingIntervalMs}ms`,
  );
  console.log(`📍 Default Target: ${publicConfig.defaultTarget}`);
});

// Add HTTP server logging
batcher.addStateTransition("http:start", ({ port }) => {
  console.log(`🌐 HTTP Server: http://localhost:${port}`);
});

main(function* () {


  // Run the batcher (handles HTTP server and polling automatically)
  yield* batcher.runBatcher();
  yield* suspend();
});
```

The batcher is now running and will:

- Accept inputs via HTTP API on port 3334
- Process batches every 1000ms
- Submit to the blockchain via the adapter
- Emit state transition events for observability

## Core Concepts

### Storage as Single Source of Truth

All inputs are immediately persisted to storage. There's no in-memory pool,
eliminating consistency issues on crashes or restarts.

**Storage is fully pluggable** - implement the `BatcherStorage` interface to use
any backend (PostgreSQL, Redis, S3, etc.). The default `FileStorage` uses JSONL
files for simplicity.

### Adapters

Adapters abstract blockchain-specific logic. Each adapter implements
`BlockchainAdapter`:

```typescript
interface BlockchainAdapter {
  submitBatch(data: string, fee: string | bigint): Promise<BlockchainHash>;
  waitForTransactionReceipt(
    hash: BlockchainHash,
  ): Promise<BlockchainTransactionReceipt>;
  getAccountAddress(): string;
  getChainName(): string;
  estimateBatchFee(data: string): Promise<string | bigint> | string | bigint;
  isReady(): boolean;
  getBlockNumber(): Promise<bigint>;
}
```

Out of the box we ship adapters for the most common targets:

- `EffectstreamL2DefaultAdapter` – Effectstream's default L2 contract entrypoint.
- `EvmContractAdapter` – generic viem-powered adapter that loads any Hardhat artifact and validates `{ method, args, value }` inputs.
- `MidnightAdapter` – circuit-based submission flow for the Midnight chain.
- `BitcoinAdapter` – UTXO batching + signature validation for regtest/local setups.

### Batching Criteria

Configure when batches are submitted per adapter:

- **`time`** - Submit every N milliseconds
- **`size`** - Submit when N inputs accumulate
- **`value`** - Submit when accumulated value reaches threshold
- **`hybrid`** - Submit when time OR size criteria met
- **`custom`** - Provide your own `isBatchReadyFn`

### State Transitions

Hook into batch lifecycle for logging, metrics, or custom behavior:

```typescript
batcher.addStateTransition("startup", (payload) => {
  // Batcher initialized
});

batcher.addStateTransition("batch:process:start", ({ target, inputCount }) => {
  console.log(`Processing ${inputCount} inputs for ${target}`);
});

batcher.addStateTransition("error", ({ phase, error }) => {
  // Handle errors
});
```

## Configuration

Key configuration options:

```typescript
type BatcherConfig = {
  // Polling interval for checking batch criteria
  pollingIntervalMs: number;

  // Blockchain adapters keyed by name
  adapters: Record<string, BlockchainAdapter>;

  // Default adapter when input.target not specified
  defaultTarget: string;

  // Per-adapter batching rules
  batchingCriteria?: {
    [adapterName: string]: {
      criteriaType: "time" | "size" | "value" | "hybrid" | "custom";
      timeWindowMs?: number;
      maxBatchSize?: number;
      targetValue?: number;
      valueAccumulatorFn?: (input: T) => number;
      isBatchReadyFn?: (
        inputs: T[],
        lastProcessTime: number,
      ) => boolean | Promise<boolean>;
    };
  };

  // Wait behavior: "no-wait" | "wait-receipt" | "wait-effectstream-processed"
  confirmationLevel?: string | Record<string, string>;

  // Enable HTTP REST API
  enableHttpServer?: boolean;
  port?: number;

  // Enable state transition events
  enableEventSystem?: boolean;

  // Signature verification namespace
  namespace?: string;

  // Batch building configuration
  batchBuilding?: {
    maxSize?: number;
    defaultBuilder?: BatchDataBuilder<T>;
    targetBuilders?: Record<string, BatchDataBuilder<T>>;
  };
};
```

## Customization

### Custom Batching Criteria

Define your own logic for when to submit batches:

```typescript
batchingCriteria: {
  myAdapter: {
    criteriaType: "custom",
    isBatchReadyFn: async (inputs, lastProcessTime) => {
      // Custom logic: batch when we have priority inputs
      const hasPriority = inputs.some(input => input.priority === "high");
      const timePassed = Date.now() - lastProcessTime > 5000;
      return hasPriority || timePassed;
    }
  }
}
```

### Custom Adapters

Implement `BlockchainAdapter` for new chains:

```typescript
class MyChainAdapter implements BlockchainAdapter {
  async submitBatch(
    data: string,
    fee: string | bigint,
  ): Promise<BlockchainHash> {
    // Submit to your blockchain
    return txHash;
  }

  // Implement other required methods...
}
```

### Custom Batch Builders

Control how inputs are serialized into batch data:

```typescript
class MyBatchBuilder implements BatchDataBuilder<MyInput> {
  buildBatchData(
    inputs: MyInput[],
    options: any,
  ): BatchBuildingResult<MyInput> {
    // Custom serialization logic
    const data = myCustomEncoding(inputs);
    return { data, includedInputs: inputs, excludedInputs: [] };
  }
}

const config = {
  // ...
  batchBuilding: {
    defaultBuilder: new MyBatchBuilder(),
  },
};
```

### State Transition Listeners

Add custom behavior at any point in the batch lifecycle:

```typescript
// Log all batch submissions
batcher.addStateTransition("batch:submit", ({ target, hash, inputCount }) => {
  console.log(`Submitted batch ${hash} with ${inputCount} inputs to ${target}`);
});

// Track confirmation times
batcher.addStateTransition(
  "batch:confirmed",
  ({ target, hash, blockNumber }) => {
    metrics.recordConfirmation(target, Date.now() - startTime);
  },
);

// Handle errors
batcher.addStateTransition("error", ({ phase, error }) => {
  errorReporter.report(phase, error);
});
```

## API Overview

### Main Operations

- **`runBatcher(): Operation<void>`** - Effection operation that runs HTTP
  server and polling loop
- **`batchInput(input: T, confirmationLevel?, timeout?): Promise<Receipt | null>`** -
  Submit an input for batching
- **`addStateTransition(prefix, listener): void`** - Register event listener for
  batch lifecycle
- **`gracefulShutdownOp(): Operation<void>`** - Gracefully shutdown with cleanup
- **`getPublicConfig()`** - Get public configuration information
- **`getBatchingStatus()`** - Get current queue statistics

### Confirmation Levels

When calling `batchInput()`, choose how long to wait:

- **`no-wait`** - Return immediately after queuing
- **`wait-receipt`** - Wait for blockchain transaction receipt
- **`wait-effectstream-processed`** - Wait until EffectStream has processed the batch

```typescript
// Don't wait
await batcher.batchInput(input, "no-wait");

// Wait for receipt (default)
const receipt = await batcher.batchInput(input, "wait-receipt");

// Wait for full processing
const result = await batcher.batchInput(input, "wait-effectstream-processed");
console.log(`Processed in rollup block ${result.rollup}`);
```

## Folder Structure

```
packages/batcher/
├── core/                          # Core batcher functionality
│   ├── batcher.ts                 # Main Batcher class
│   ├── types.ts                   # Core types and interfaces
│   ├── config.ts                  # Configuration types
│   ├── storage.ts                 # Storage interface + FileStorage (✨ pluggable)
│   ├── batch-processor.ts         # Batch processing logic
│   ├── shutdown-manager.ts        # Graceful shutdown handling
│   └── batcher-events.ts          # Event system types
│
├── batch-data-builder/            # Batch serialization (✨ pluggable)
│   ├── batch-data-builder.ts      # Interface and types
│   └── default-batch-builder.ts   # Default implementation
│
├── adapters/                      # Blockchain adapters (✨ pluggable)
│   ├── adapter.ts                 # Base adapter interface
│   ├── effectstream-l2-adapter.ts  # EffectstreamL2 EVM implementation
│   ├── evm-contract-adapter.ts    # Generic ABI-driven EVM adapter
│   ├── midnight-adapter.ts        # Midnight circuit adapter
│   └── bitcoin-adapter.ts         # Bitcoin regtest adapter
│
└── server/                        # HTTP API
    └── batcher-server.ts          # Fastify server implementation
```

## HTTP API

When `enableHttpServer: true`, the batcher exposes a REST API:

- **`POST /batch-input`** - Submit an input for batching
- **`GET /status`** - Get batching status and statistics
- **`GET /health`** - Health check endpoint
- **`POST /force-process`** - Manually trigger batch processing

Example:

```bash
curl -X POST http://localhost:3334/batch-input \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x...",
    "input": "myGameInput",
    "signature": "0x...",
    "timestamp": 1234567890
  }'
```

`signature` is optional for chains/adapters that override `verifySignature` (for example Midnight). When omitted, the adapter must implement its own verification semantics.
