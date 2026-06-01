# Configuration

## Overview

Configuring the Batcher involves creating a unified configuration object that defines global settings, blockchain adapters, and batching behavior. This guide walks through the complete configuration process-from instantiating adapters to launching the batcher service.

Understanding the configuration system helps you:
- Wire multiple blockchain adapters to a single batcher
- Configure different batching strategies per blockchain
- Set appropriate confirmation levels for your use case
- Customize HTTP server and event system behavior

## Target Audience

Developers setting up the Batcher who need to:
- Connect to one or more blockchain networks
- Configure batching behavior for different chains
- Set up the HTTP server for receiving inputs
- Customize confirmation levels and retry behavior

## Configuration Architecture

The batcher supports two configuration approaches:

### 1. Dynamic Configuration (Recommended)

Use the **builder pattern** to wire adapters and criteria progressively after instantiation (before initialization):

```typescript
// 1. Create batcher with base config (no adapters yet)
const batcher = createNewBatcher({
  pollingIntervalMs: 1000,
  port: 3334,
  enableHttpServer: true,
  adapters: {} // Start with no adapters
}, storage);

// 2. Dynamically add adapters with their criteria
batcher
  .addBlockchainAdapter("evm", evmAdapter, { 
    criteriaType: "time", 
    timeWindowMs: 5000 
  })
  .addBlockchainAdapter("midnight", midnightAdapter, { 
    criteriaType: "size", 
    maxBatchSize: 10 
  })
  .setDefaultTarget("evm");

// 3. Initialize and start
await batcher.init();
```

This approach offers maximum flexibility-adapters can be added progressively before initialization.

### 2. Unified Configuration (Alternative)

Define everything in a single configuration object:

```typescript
const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  port: 3334,
  enableHttpServer: true,
  
  // Define adapters upfront
  adapters: {
    evm: evmAdapter,
    midnight: midnightAdapter
  },
  
  defaultTarget: "evm",
  
  // Per-adapter batching criteria
  batchingCriteria: {
    evm: { criteriaType: "time", timeWindowMs: 5000 },
    midnight: { criteriaType: "size", maxBatchSize: 10 }
  },
  
  confirmationLevel: "wait-receipt"
};

const batcher = createNewBatcher(config, storage);
await batcher.init();
```

This approach is more concise for static configurations but less flexible.

:::tip When to Use Each Approach
- **Dynamic configuration**: When adapters are conditionally enabled or loaded from plugins
- **Unified configuration**: When all adapters are known at startup and configuration is static
:::

:::warning Configuration Must Be Done Before Initialization
All configuration methods (`addBlockchainAdapter`, `setDefaultTarget`, `setBatchingCriteria`) must be called **before** calling `init()` or `runBatcher()`. Once the batcher is initialized, the configuration is locked and cannot be modified.

```typescript
const batcher = createNewBatcher({ /* ... */ }, storage);

// ✅ OK: Adding adapters before init()
batcher.addBlockchainAdapter("evm", evmAdapter, { /* ... */ });

await batcher.init();

// ❌ ERROR: Cannot add adapters after init()
batcher.addBlockchainAdapter("midnight", midnightAdapter, { /* ... */ });
// Throws: "Cannot add adapters after batcher has been initialized"
```
:::

## Configuration Steps (Dynamic Approach)

The dynamic configuration approach follows these steps:

### Step 1: Create Base Configuration

Create the base configuration object with global settings. **Adapters are not included here**-they'll be added dynamically in Step 3:

```typescript
import { type BatcherConfig } from "@effectstream/batcher-sdk";

const baseConfig: BatcherConfig = {
  // Polling frequency (how often to check if batching criteria are met)
  pollingIntervalMs: 1000,  // Check every 1 second
  
  // HTTP server configuration
  port: 3334,
  enableHttpServer: true,  // Enable REST API endpoints
  
  // Event system for monitoring
  enableEventSystem: true,  // Enable state transition events
  
  // Signature verification namespace
  namespace: "effectstream_batcher",  // Used for signature message construction
  
  // Start with empty adapters - we'll add them dynamically
  adapters: {}
}
```

#### Global Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `pollingIntervalMs` | `number` | `1000` | How often each independent adapter loop checks if batching criteria are met (milliseconds) |
| `port` | `number` | `3000` | HTTP server port |
| `enableHttpServer` | `boolean` | `true` | Whether to start the HTTP REST API |
| `enableEventSystem` | `boolean` | `false` | Whether to enable state transition events |
| `namespace` | `string` | `"effectstream_batcher"` | Namespace for signature verification |
| `maxRetries` | `number` | `3` | Maximum retry attempts for failed transactions |
| `retryDelayMs` | `number` | `1000` | Delay between retry attempts (milliseconds) |

:::tip
Set `pollingIntervalMs` to match your shortest batching time window. For example, if using `timeWindowMs: 5000`, a `pollingIntervalMs` of 1000 ensures responsive batch submission.
:::

### Step 2: Instantiate Blockchain Adapters

Instantiate each blockchain adapter you want to use:

```typescript
import { EffectstreamL2DefaultAdapter } from "@effectstream/batcher-sdk";

const evmAdapter = new EffectstreamL2DefaultAdapter(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  0n,
  "mainEvmRPC"
);
```

:::info Adapter Details
For comprehensive information about adapters, their responsibilities, and examples for different blockchains, see [Core Concepts - BlockchainAdapter](./1220-core-concepts.md#blockchainadapter).
:::

### Step 3: Instantiate Batcher and Add Adapters Dynamically

Now create the batcher instance and use the **builder pattern** to wire adapters:

```typescript
import { createNewBatcher, FileStorage } from "@effectstream/batcher-sdk";

// Create storage
const storage = new FileStorage("./batcher-data");

// Create batcher using the factory function
const batcher = createNewBatcher(baseConfig, storage);

// Wire adapters using addBlockchainAdapter()
batcher
  .addBlockchainAdapter(
    "evm",              // Target name
    evmAdapter,         // Adapter instance
    {                   // Batching criteria for this adapter
      criteriaType: "time",
      timeWindowMs: 5000
    }
  )
  .addBlockchainAdapter(
    "midnight",
    midnightAdapter,
    {
      criteriaType: "size",
      maxBatchSize: 10
    }
  )
  .addBlockchainAdapter(
    "nft",
    nftAdapter,
    {
      criteriaType: "hybrid",
      timeWindowMs: 10000,
      maxBatchSize: 20
    }
  );
```

#### The `createNewBatcher()` Factory Function

```typescript
createNewBatcher<T>(
  config: BatcherConfig<T>,
  storage?: BatcherStorage<T>
): Batcher<T>
```

This factory function is the **recommended way** to create a batcher instance. It provides a cleaner API than using the constructor directly.

#### The `addBlockchainAdapter()` Method

```typescript
addBlockchainAdapter(
  name: string,                          // Target name for routing
  adapter: BlockchainAdapter<any>,       // Adapter instance
  criteria: BatchingCriteriaConfig       // When to submit batches
): Batcher
```

This method:
- **Wires** a target name to its adapter logic
- **Assigns** batching criteria for this specific adapter
- **Returns** the batcher instance for method chaining
- **Must be called before `init()`** - throws error if batcher is already initialized

:::tip Method Chaining
`addBlockchainAdapter()` returns `this`, enabling fluent method chaining to add multiple adapters.
:::

### Step 4: Set Default Target

Use `setDefaultTarget()` to specify which adapter handles inputs without an explicit `target` field:

```typescript
batcher.setDefaultTarget("evm");
```

Now inputs without a `target` field will automatically route to the `evmAdapter`.

#### The `setDefaultTarget()` Method

```typescript
setDefaultTarget(target: string): Batcher
```

This method:
- **Sets** the default adapter for inputs without `target` field
- **Validates** that the target exists in the adapters map
- **Returns** the batcher instance for method chaining
- **Must be called before `init()`** - throws error if batcher is already initialized

:::warning Required Adapters First
You must call `addBlockchainAdapter()` for a target before calling `setDefaultTarget()` with that target name. Otherwise, validation will fail.
:::

### How Target Routing Works

The **target name** (e.g., `"evm"`, `"midnight"`) is how inputs route to the correct adapter:

```typescript
// Example input specifying target
{
  address: "0x...",
  addressType: 0,
  input: "myCommand|arg1|arg2",
  signature: "0x...",
  timestamp: "1234567890",
  target: "midnight"  // Routes to midnightAdapter
}

// Example input using default target
{
  address: "0x...",
  addressType: 0,
  input: "myCommand|arg1|arg2",
  signature: "0x...",
  timestamp: "1234567890"
  // No target specified -> routes to evmAdapter (the defaultTarget)
}
```

:::warning Target Names Must Match
The `target` field in inputs must exactly match a name passed to `addBlockchainAdapter()`. Mismatched targets will result in a `404` error.
:::

### Batching Criteria in Dynamic Configuration

Notice that batching criteria are specified **per-adapter** when calling `addBlockchainAdapter()`:

```typescript
batcher.addBlockchainAdapter(
  "evm",
  evmAdapter,
  { criteriaType: "time", timeWindowMs: 5000 }  // ← Criteria here
);
```

Each adapter gets its own independent batching rules. If no criteria is provided, it defaults to:
```typescript
{ criteriaType: "size", maxBatchSize: 1 }  // Process immediately
```

:::info Batching Criteria Types
For detailed information about all batching criteria types (time, size, hybrid, value, custom) and their use cases, see [The Batching Pipeline - Batching Criteria Types](./1230-batching-pipeline.md#batching-criteria-types).
:::

### Step 5: Initialize and Start the Batcher

With adapters wired and default target set, initialize and start the batcher:

```typescript
await batcher.init();

console.log("✅ Batcher started successfully");
console.log(`🌐 HTTP Server: http://localhost:${baseConfig.port}`);
```

The batcher is now running and ready to accept inputs!

## Complete Example (Dynamic Configuration)

Here's a complete example using the dynamic approach:

```typescript
import {
  createNewBatcher,
  FileStorage,
  EffectstreamL2DefaultAdapter,
  MidnightAdapter
} from "@effectstream/batcher-sdk";

// 1. Instantiate adapters
const evmAdapter = new EffectstreamL2DefaultAdapter(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  process.env["EVM_PRIVATE_KEY"]!,
  0n,
  "mainEvmRPC"
);

const midnightAdapter = new MidnightAdapter(
  "0xabc...",
  process.env["MIDNIGHT_WALLET_SEED"]!,
  {
    indexer: "http://localhost:8088/api/v1/graphql",
    indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
    node: "http://localhost:9944",
    proofServer: "http://localhost:6300",
    zkConfigPath: "./zkproof.json",
    privateStateStoreName: "batcher-state",
    privateStateId: "batcherPrivateState"
  },
  contractInstance,
  witnesses,
  contractInfo,
  0,
  "midnightRPC"
);

// 2. Create storage
const storage = new FileStorage("./batcher-data");

// 3. Create batcher with base config
const batcher = createNewBatcher({
  pollingIntervalMs: 1000,
  port: 3334,
  enableHttpServer: true,
  enableEventSystem: true,
  adapters: {} // Start empty
}, storage);

// 4. Wire adapters with their criteria
batcher
  .addBlockchainAdapter("evm", evmAdapter, {
    criteriaType: "time",
    timeWindowMs: 5000
  })
  .addBlockchainAdapter("midnight", midnightAdapter, {
    criteriaType: "hybrid",
    timeWindowMs: 10000,
    maxBatchSize: 20
  })
  .setDefaultTarget("evm");

// 5. Initialize and start
await batcher.init();

console.log("🎯 Batcher ready");
console.log("📋 Adapters: evm (default), midnight");
```

## Alternative: Unified Configuration

If you prefer defining everything upfront, you can use the unified configuration approach:

### Step 1: Define Complete Configuration

```typescript
import {
  createNewBatcher,
  FileStorage,
  type BatcherConfig,
  EffectstreamL2DefaultAdapter
} from "@effectstream/batcher-sdk";

// Instantiate adapters first
const evmAdapter = new EffectstreamL2DefaultAdapter(/* ... */);
const midnightAdapter = new MidnightAdapter(/* ... */);

// Create unified configuration
const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  port: 3334,
  enableHttpServer: true,
  enableEventSystem: true,
  
  // Define all adapters upfront
  adapters: {
    evm: evmAdapter,
    midnight: midnightAdapter
  },
  
  // Set default target
  defaultTarget: "evm",
  
  // Per-adapter batching criteria
  batchingCriteria: {
    evm: {
      criteriaType: "time",
      timeWindowMs: 5000
    },
    midnight: {
      criteriaType: "hybrid",
      timeWindowMs: 10000,
      maxBatchSize: 20
    }
  }
};
```

### Step 2: Instantiate and Launch

```typescript
const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);
await batcher.init();
```

This approach is more concise but offers less pre-initialization flexibility.

## Confirmation Level Configuration

Confirmation levels can be configured globally or per-adapter:

```typescript
// Global: applies to all adapters
confirmationLevel: "wait-receipt"

// Per-adapter: different levels for different chains
confirmationLevel: {
  evm: "no-wait",
  midnight: "wait-effectstream-processed"
}
```

:::info Understanding Confirmation Levels
For detailed information about confirmation levels, their behavior in the pipeline, and when to use each, see:
- [Core Concepts - Confirmation Level](./1220-core-concepts.md#confirmation-level-global-default-for-http-api)
- [The Batching Pipeline - Confirmation Levels](./1230-batching-pipeline.md#confirmation-level-fallback-logic)
:::

## Storage Configuration

Choose a storage backend for persisting pending inputs:

```typescript
import { FileStorage } from "@effectstream/batcher-sdk";

const storage = new FileStorage("./batcher-data");
```

Available storage options:
- **FileStorage**: Simple JSON file storage (good for development)
- **PostgreSQL**: Production-grade relational database (coming soon)
- **Redis**: In-memory storage with persistence (coming soon)

:::warning Storage is Critical
Storage is the single source of truth for all pending inputs. Choose a reliable storage backend for production use. The batcher survives crashes by reloading inputs from storage on restart.
:::

## Graceful Shutdown Configuration

The batcher supports graceful shutdown with customizable hooks that execute at specific phases of the shutdown process.

### Shutdown Configuration

```typescript
import { createNewBatcher } from "@effectstream/batcher-sdk";

const batcher = createNewBatcher({
  pollingIntervalMs: 1000,
  adapters: {},
  shutdown: {
    // Timeout for the entire shutdown process
    timeoutMs: 30000,  // 30 seconds
    
    // Signal handling configuration
    signalHandling: {
      signals: ["SIGINT", "SIGTERM"],  // Which signals to listen for
      exitCode: 0                       // Exit code after shutdown
    },
    
    // Custom hooks for each shutdown phase
    hooks: {
      preShutdown: async (batcher) => {
        console.log("🛑 Beginning graceful shutdown...");
      },
      stopAcceptingInputs: async (batcher) => {
        console.log("🚫 Stopped accepting new inputs");
      },
      waitForProcessing: async (batcher) => {
        console.log("⏳ Waiting for batch processing to complete...");
      },
      cleanup: async (batcher) => {
        console.log("🧹 Cleaning up resources...");
      },
      postShutdown: async (batcher) => {
        console.log("✅ Shutdown complete");
      }
    }
  }
}, storage);

batcher
  .addBlockchainAdapter("evm", evmAdapter, { /* criteria */ })
  .setDefaultTarget("evm");

await batcher.init();
```

### Shutdown Hooks

The shutdown process executes in **5 distinct phases**, each with an optional hook you can customize:

#### 1. `preShutdown` Hook

**Executes:** At the very beginning of the shutdown process, before any shutdown logic runs.

**Signature:**
```typescript
preShutdown?: (batcher: Batcher<T>) => Promise<void> | void
```

**Use Cases:**
- Log shutdown initiation
- Send notifications to monitoring systems
- Set application state to "shutting down"
- Begin draining external queues

**Example:**
```typescript
preShutdown: async (batcher) => {
  console.log("🛑 Shutdown initiated");
  await notifyMonitoring({ event: "batcher_shutdown_start" });
  await externalQueue.pauseProducers();
}
```

#### 2. `stopAcceptingInputs` Hook

**Executes:** After HTTP server is stopped and polling has ended, but before waiting for ongoing processing.

**Signature:**
```typescript
stopAcceptingInputs?: (batcher: Batcher<T>) => Promise<void> | void
```

**What Happens Before This Hook:**
- HTTP server is stopped (no new API requests accepted)
- Polling interval is cleared (no new batch processing triggered)

**Use Cases:**
- Close external connections
- Stop consuming from external queues
- Update load balancer health checks
- Finalize any input-related state

**Example:**
```typescript
stopAcceptingInputs: async (batcher) => {
  console.log("🚫 No longer accepting inputs");
  await messageQueue.disconnect();
  await redis.set("batcher:status", "draining");
}
```

#### 3. `waitForProcessing` Hook

**Executes:** While waiting for any in-progress batch processing to complete across all adapters.

**Signature:**
```typescript
waitForProcessing?: (batcher: Batcher<T>) => Promise<void> | void
```

**What Happens Before This Hook:**
- The batcher waits for all adapters in the `processingAdapters` set to finish
- This respects the `timeoutMs` setting

**Use Cases:**
- Monitor progress of ongoing operations
- Log status updates during the wait
- Perform parallel cleanup that can happen during processing
- Update progress bars or status dashboards

**Example:**
```typescript
waitForProcessing: async (batcher) => {
  console.log("⏳ Waiting for ongoing batches to complete...");
  const status = await batcher.getBatchingStatus();
  console.log(`  Pending inputs: ${status.totalPendingInputs}`);
  await metrics.gauge("batcher.shutdown.pending", status.totalPendingInputs);
}
```

#### 4. `cleanup` Hook

**Executes:** During the resource cleanup phase, after all processing has finished.

**Signature:**
```typescript
cleanup?: (batcher: Batcher<T>) => Promise<void> | void
```

**What Happens Before This Hook:**
- All batch processing has completed
- Built-in `cleanupResources()` is called

**Use Cases:**
- Close database connections
- Flush logs and metrics
- Clean up temporary files
- Release locks and semaphores
- Disconnect from external services

**Example:**
```typescript
cleanup: async (batcher) => {
  console.log("🧹 Cleaning up resources...");
  await database.disconnect();
  await logger.flush();
  await redis.del("batcher:locks:*");
  await fs.remove("./temp-batch-data");
}
```

#### 5. `postShutdown` Hook

**Executes:** At the very end, after all shutdown logic has completed successfully.

**Signature:**
```typescript
postShutdown?: (batcher: Batcher<T>) => Promise<void> | void
```

**Use Cases:**
- Final logging
- Send completion notifications
- Record shutdown metrics
- Update external state to "stopped"

**Example:**
```typescript
postShutdown: async (batcher) => {
  console.log("✅ Batcher shutdown complete");
  await notifyMonitoring({ event: "batcher_shutdown_complete" });
  await redis.set("batcher:status", "stopped");
  await metrics.increment("batcher.shutdowns.successful");
}
```

### Shutdown Process Flow

The complete shutdown sequence:

```
1. preShutdown hook
   ↓
2. Stop HTTP server
   Stop all polling loops
   ↓
3. stopAcceptingInputs hook
   ↓
4. Wait for all adapters to finish processing (respects timeoutMs)
   ↓
5. waitForProcessing hook
   ↓
6. Call built-in cleanupResources()
   ↓
7. cleanup hook
   ↓
8. postShutdown hook
   ↓
9. Shutdown complete
```

### Error Handling

If any hook throws an error:
- **Default**: Shutdown process stops and error is thrown
- **With `force: true`**: Error is logged but shutdown continues

```typescript
// Trigger shutdown with force option
await batcher.gracefulShutdown(hooks, { 
  timeoutMs: 30000,
  force: true  // Continue shutdown even if hooks fail
});
```

### Timeout Behavior

The `timeoutMs` setting applies to the entire shutdown process:

```typescript
shutdown: {
  timeoutMs: 30000  // 30 second timeout for complete shutdown
}
```

If the timeout is reached:
- A warning is logged
- Shutdown completes immediately
- Any pending operations are interrupted

### Manual Shutdown

You can trigger shutdown manually (without signals):

```typescript
// Using the Effection operation (recommended)
import { main } from "effection";

main(function* () {
  yield* batcher.runBatcher();
  
  // Later...
  yield* batcher.gracefulShutdownOp(hooks, { timeoutMs: 30000 });
});

// Using the async version
await batcher.gracefulShutdown(hooks, { timeoutMs: 30000 });
```

## Configuration Validation

The batcher validates configuration and provides helpful error messages:

```typescript
const batcher = createNewBatcher({ adapters: {} }, storage);

// ❌ Invalid default target (adapter not added yet)
batcher.setDefaultTarget("evm");
// Error: "evm" not in adapters - must call addBlockchainAdapter first

// ❌ Missing required criteria fields
batcher.addBlockchainAdapter("evm", evmAdapter, {
  criteriaType: "time"  // Error: timeWindowMs required for time criteria
});

// ✅ Correct usage
batcher
  .addBlockchainAdapter("evm", evmAdapter, {
    criteriaType: "time",
    timeWindowMs: 5000  // All required fields present
  })
  .setDefaultTarget("evm");  // Valid: "evm" exists now

// ❌ Cannot modify after initialization
await batcher.init();
batcher.addBlockchainAdapter("midnight", midnightAdapter, { /* ... */ });
// Error: "Cannot add adapters after batcher has been initialized"
```

## Next Steps

- Learn about [Custom Adapters](./1250-adapter.md) to support new blockchains
- Explore [Batching Criteria](./1290-advanced-topics.md#batching-criteria) for advanced batch timing strategies
- Review [The Batching Pipeline](./1230-batching-pipeline.md) to understand the input lifecycle
- Check [HTTP API Reference](./1290-advanced-topics.md#http-api) for endpoint documentation