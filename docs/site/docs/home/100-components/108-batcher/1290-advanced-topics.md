# Advanced Topics

## Overview

This guide covers advanced features of the Batcher that provide powerful customization, monitoring, and operational capabilities:

- **HTTP API**: REST endpoints for submitting inputs and monitoring system status
- **Batching Criteria**: Advanced strategies for controlling when batches are submitted
- **Event System**: Lifecycle hooks for observability and custom behavior
- **Storage System**: Pluggable persistence layer for crash-safe operation

## Target Audience

Developers who need to:
- Interact with the batcher programmatically via HTTP
- Implement sophisticated batching strategies
- Monitor batcher operations in production
- Build custom storage backends
- Add logging, metrics, or alerting integrations

---

## HTTP API

The Batcher exposes a RESTful HTTP API when `enableHttpServer` is enabled. The API includes comprehensive OpenAPI documentation accessible at `/documentation`.

### Configuration

Enable the HTTP server in your configuration:

```typescript
const config: PaimaBatcherConfig = {
  enableHttpServer: true,
  port: 3334,
  // ... other config
};
```

The API will be available at `http://localhost:3334` with interactive documentation at `http://localhost:3334/documentation`.

### Endpoints

#### 1. `POST /send-input` – Submit User Input

Submit a new input to the batching queue.

**Request Body:**
```typescript
{
  "data": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "addressType": 0,  // AddressType.EVM
    "input": "myGameCommand|arg1|arg2",
    "signature": "0x...",
    "timestamp": "1234567890",
    "target": "ethereum"  // Optional, uses defaultTarget if not specified
  },
  "confirmationLevel": "wait-receipt"  // Optional: "no-wait" | "wait-receipt" | "wait-effectstream-processed"
}
```

**Confirmation Level Behavior:**

| Level | Returns When | Response Includes |
|-------|-------------|-------------------|
| `"no-wait"` | Immediately after queuing | `{ success, message, inputsProcessed }` |
| `"wait-receipt"` | After blockchain confirmation | `{ success, message, transactionHash, inputsProcessed }` |
| `"wait-effectstream-processed"` | After Paima Engine processes | `{ success, message, transactionHash, rollup, inputsProcessed }` |

**Response Example (`wait-receipt`):**
```json
{
  "success": true,
  "message": "Input processed successfully",
  "transactionHash": "0xabc123...",
  "inputsProcessed": 1
}
```

**Error Responses:**

| Status Code | Meaning |
|------------|---------|
| `400 Bad Request` | Invalid input format or validation failure |
| `401 Unauthorized` | Signature verification failed |
| `404 Not Found` | Specified target adapter doesn't exist |
| `503 Service Unavailable` | Batcher is shutting down |

**Example:**
```bash
curl -X POST http://localhost:3334/send-input \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "addressType": 0,
      "input": "move|x10y20",
      "signature": "0x...",
      "timestamp": "1234567890"
    },
    "confirmationLevel": "wait-receipt"
  }'
```

---

#### 2. `GET /status` – Batcher Status

Get comprehensive batcher status including configuration and queue statistics.

**Response:**
```typescript
{
  "batcher": {
    "isInitialized": true,
    "totalPendingInputs": 42,
    "targets": [
      {
        "target": "ethereum",
        "pendingInputs": 30,
        "isReady": false,
        "criteriaType": "time",
        "timeSinceLastProcess": 3500
      },
      {
        "target": "midnight",
        "pendingInputs": 12,
        "isReady": true,
        "criteriaType": "size",
        "timeSinceLastProcess": 8000
      }
    ],
    "adapterTargets": ["ethereum", "midnight"]
  },
  "config": {
    "pollingIntervalMs": 1000,
    "defaultTarget": "ethereum",
    "enableHttpServer": true,
    "enableEventSystem": true,
    "confirmationLevel": "wait-receipt"
  },
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

**Use Cases:**
- Health checks for load balancers
- Monitoring dashboards
- Debugging queue state
- Verifying configuration

**Example:**
```bash
curl http://localhost:3334/status
```

---

#### 3. `GET /queue-stats` – Queue Statistics

Get detailed per-target queue statistics (lightweight version of `/status`).

**Response:**
```typescript
{
  "totalPendingInputs": 42,
  "targets": [
    {
      "target": "ethereum",
      "pendingInputs": 30,
      "isReady": false,
      "criteriaType": "time",
      "timeSinceLastProcess": 3500
    },
    {
      "target": "midnight",
      "pendingInputs": 12,
      "isReady": true,
      "criteriaType": "size",
      "timeSinceLastProcess": 8000
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3334/queue-stats
```

---

#### 4. `POST /force-batch` – Force Batch Processing (Developer)

Immediately trigger batch processing for all targets, bypassing batching criteria.

**Use Cases:**
- Testing and debugging
- Manual batch submission during off-peak hours
- Emergency queue draining

**Response:**
```json
{
  "success": true,
  "message": "Batch processing forced",
  "remainingInputs": 5
}
```

**Warning:** This endpoint is intended for **development and operational use only**. In production, batching criteria should determine when batches are submitted.

**Example:**
```bash
curl -X POST http://localhost:3334/force-batch
```

---

#### 5. `GET /health` – Health Check

Lightweight health check endpoint for monitoring systems.

**Response:**
```json
{
  "status": "ok",
  "isInitialized": true,
  "isRunning": true
}
```

**Example:**
```bash
curl http://localhost:3334/health
```

---

#### 6. `DELETE /clear-inputs` – Clear Pending Inputs (Developer)

**⚠️ DESTRUCTIVE OPERATION** – Delete all pending inputs from storage.

**Use Cases:**
- Testing environment cleanup
- Recovery from corrupted queue state
- Development workflow reset

**Response:**
```json
{
  "success": true,
  "message": "All pending inputs cleared"
}
```

**Warning:** This operation is **irreversible**. Use with extreme caution, especially in production environments.

**Example:**
```bash
curl -X DELETE http://localhost:3334/clear-inputs
```

---

### OpenAPI Documentation

The batcher includes interactive API documentation powered by Swagger UI.

**Access:** `http://localhost:3334/documentation`

Features:
- **Try It Out**: Test API endpoints directly from the browser
- **Schema Validation**: View request/response schemas
- **Example Values**: Pre-filled example payloads
- **Export**: Download OpenAPI spec as JSON or YAML

**Programmatic Access:**
- JSON spec: `http://localhost:3334/documentation/json`
- YAML spec: `http://localhost:3334/documentation/yaml`

---

## Batching Criteria

Batching criteria define **when** the batcher should submit accumulated inputs to the blockchain. Each adapter target can have its own independent criteria.

### Configuration Structure

```typescript
const config: PaimaBatcherConfig = {
  batchingCriteria: {
    [targetName]: {
      criteriaType: "time" | "size" | "value" | "hybrid" | "custom",
      // ... type-specific fields
    }
  }
};
```

If no criteria is specified for a target, it defaults to:
```typescript
{ criteriaType: "size", maxBatchSize: 1 }  // Process immediately
```

---

### Criteria Types

#### 1. Time-Based Criteria

Submit batches at regular time intervals, regardless of input count.

**Configuration:**
```typescript
{
  criteriaType: "time",
  timeWindowMs: 5000  // Submit every 5 seconds
}
```

**Use Cases:**
- **Predictable submission schedules**: Submit every 5 minutes for cost efficiency
- **Low-frequency applications**: Games with turn-based mechanics
- **Cost optimization**: Batch during off-peak hours to reduce gas fees

**Behavior:**
- Timer resets after each batch submission
- If queue is empty when timer expires, nothing happens
- Multiple inputs submitted in same batch reduce per-input costs

**Example:**
```typescript
batcher.addBlockchainAdapter("ethereum", evmAdapter, {
  criteriaType: "time",
  timeWindowMs: 300000  // Submit every 5 minutes
});
```

---

#### 2. Size-Based Criteria

Submit batches when the input queue reaches a certain length.

**Configuration:**
```typescript
{
  criteriaType: "size",
  maxBatchSize: 100  // Submit when 100 inputs accumulate
}
```

**Important:** The `maxBatchSize` here represents **number of inputs**, not bytes. This is different from the adapter's `maxBatchSize` (which limits serialized batch size in bytes).

**Use Cases:**
- **High-throughput applications**: Process as soon as enough inputs accumulate
- **Fairness guarantees**: Ensure inputs are processed within N other inputs
- **Burst handling**: Automatically batch during traffic spikes

**Behavior:**
- Checked on every polling interval (`pollingIntervalMs`)
- If 100+ inputs are queued, batch is submitted immediately
- Remaining inputs stay queued for next batch

**Example:**
```typescript
batcher.addBlockchainAdapter("nft", nftAdapter, {
  criteriaType: "size",
  maxBatchSize: 50  // Submit when 50 mint requests accumulate
});
```

---

#### 3. Value-Based Criteria

Submit batches when the accumulated "value" of inputs reaches a threshold. Useful for financial applications where you want to batch by transaction volume.

**Configuration:**
```typescript
{
  criteriaType: "value",
  valueAccumulatorFn: (input: MyInput) => input.amount,  // Extract value
  targetValue: 1000  // Submit when total reaches 1000
}
```

**Use Cases:**
- **Payment batching**: Submit when total value reaches $1000
- **Token transfers**: Batch until X tokens accumulated
- **Priority systems**: Accumulate "priority points" until threshold

**Behavior:**
- `valueAccumulatorFn` extracts numeric value from each input
- Values are summed across all pending inputs
- Batch submitted when sum ≥ `targetValue`

**Example:**
```typescript
interface PaymentInput extends DefaultBatcherInput {
  amount: number;  // Custom field
}

batcher.addBlockchainAdapter("payments", paymentsAdapter, {
  criteriaType: "value",
  valueAccumulatorFn: (input: PaymentInput) => input.amount,
  targetValue: 100000  // Submit when $1000 accumulated (cents)
});
```

---

#### 4. Hybrid Criteria

Submit batches when **either** time or size criteria is met (whichever comes first).

**Configuration:**
```typescript
{
  criteriaType: "hybrid",
  timeWindowMs: 60000,   // 1 minute timeout
  maxBatchSize: 100       // OR 100 inputs
}
```

**Use Cases:**
- **Responsive with backpressure protection**: Don't wait forever for size, but don't submit tiny batches
- **Variable traffic**: Handle both high and low traffic gracefully
- **Latency guarantees**: "Process within 1 minute OR 100 inputs"

**Behavior:**
- Whichever condition is met first triggers batch submission
- Both timers and counters reset after submission

**Example:**
```typescript
batcher.addBlockchainAdapter("polygon", polygonAdapter, {
  criteriaType: "hybrid",
  timeWindowMs: 5000,    // At most 5 seconds between batches
  maxBatchSize: 50        // At most 50 inputs queued
});
```

---

#### 5. Custom Criteria

Define completely custom logic for determining batch readiness using a function.

**Configuration:**
```typescript
{
  criteriaType: "custom",
  isBatchReadyFn: async (inputs, lastProcessTime) => {
    // Your custom logic
    return true; // or false
  }
}
```

**Function Signature:**
```typescript
type BatchReadyFunction<T> = (
  pendingInputs: T[],
  lastProcessTime: number  // Timestamp of last batch submission
) => boolean | Promise<boolean>
```

**Use Cases:**
- **Complex business logic**: Multi-factor batching decisions
- **External signals**: Check external API for batch timing
- **Priority systems**: Process immediately if high-priority input exists
- **Gas price monitoring**: Submit when gas prices drop below threshold

**Example 1: Priority-Based Batching**
```typescript
interface PriorityInput extends DefaultBatcherInput {
  priority: "low" | "medium" | "high";
}

batcher.addBlockchainAdapter("priority", priorityAdapter, {
  criteriaType: "custom",
  isBatchReadyFn: (inputs: PriorityInput[], lastProcessTime) => {
    // Submit immediately if any high-priority input exists
    const hasHighPriority = inputs.some(inp => inp.priority === "high");
    if (hasHighPriority) return true;
    
    // Otherwise, wait for 10 seconds or 20 inputs
    const timePassed = Date.now() - lastProcessTime > 10000;
    const enoughInputs = inputs.length >= 20;
    return timePassed || enoughInputs;
  }
});
```

**Example 2: Gas Price Monitoring**
```typescript
batcher.addBlockchainAdapter("ethereum", evmAdapter, {
  criteriaType: "custom",
  isBatchReadyFn: async (inputs, lastProcessTime) => {
    // Don't submit if queue is empty
    if (inputs.length === 0) return false;
    
    // Fetch current gas price
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceGwei = Number(gasPrice) / 1e9;
    
    // Submit if gas is cheap (< 20 gwei) OR we've waited > 5 minutes
    const gasIsCheap = gasPriceGwei < 20;
    const timeoutReached = Date.now() - lastProcessTime > 300000;
    
    return gasIsCheap || timeoutReached;
  }
});
```

**Example 3: External API Signal**
```typescript
batcher.addBlockchainAdapter("midnight", midnightAdapter, {
  criteriaType: "custom",
  isBatchReadyFn: async (inputs) => {
    if (inputs.length === 0) return false;
    
    // Check if backend approves batch submission
    const response = await fetch("https://api.example.com/should-batch");
    const { shouldBatch } = await response.json();
    
    return shouldBatch && inputs.length >= 5;
  }
});
```

**Error Handling:**

If `isBatchReadyFn` throws an error:
- Error is logged to console
- Function returns `false` (batch not ready)
- Batcher continues polling normally

Always wrap external calls in try/catch if they might fail:

```typescript
isBatchReadyFn: async (inputs) => {
  try {
    const result = await externalApi.checkCondition();
    return result.ready;
  } catch (error) {
    console.error("Custom criteria failed:", error);
    return false;  // Fail safe
  }
}
```

---

### Batching Criteria Best Practices

1. **Start with hybrid criteria** for most applications:
   ```typescript
   { criteriaType: "hybrid", timeWindowMs: 5000, maxBatchSize: 50 }
   ```

2. **Consider gas costs**: Larger batches = lower per-input cost, but watch adapter `maxBatchSize` limits

3. **Monitor queue depth**: Use `/queue-stats` to ensure criteria aren't too conservative

4. **Test under load**: Simulate traffic patterns to validate criteria performance

5. **Per-chain optimization**: Different chains have different cost profiles—configure accordingly

---

## Event System

The event system provides **lifecycle hooks** for observability, logging, metrics, and custom behavior. Events are emitted at key points in the batching pipeline.

### Enabling Events

```typescript
const config: PaimaBatcherConfig = {
  enableEventSystem: true,  // Required to emit events
  // ... other config
};
```

**Note:** Even with `enableEventSystem: false`, you can still register listeners—they just won't be called.

### Adding Event Listeners

Use `batcher.addStateTransition()` to register listeners:

```typescript
batcher.addStateTransition("startup", (payload) => {
  console.log("Batcher started:", payload.publicConfig);
});
```

**Listener Signature:**
```typescript
type BatcherListener<Prefix> = (
  payload: Grammar[Prefix]
) => void | Promise<void>
```

Listeners can be **synchronous or asynchronous**. The event system handles both automatically using Effection's `lift()`.

---

### Available Events

The batcher emits the following events:

#### 1. `startup` – Batcher Initialization

**When:** After the batcher is initialized and ready to accept inputs.

**Payload:**
```typescript
{
  publicConfig: {
    pollingIntervalMs: number;
    defaultTarget: string;
    enableHttpServer: boolean;
    enableEventSystem: boolean;
    confirmationLevel: string | Record<string, string>;
    port: number;
    adapterTargets: string[];
    criteriaTypes: Record<string, string>;
  };
  time: number;  // Timestamp
}
```

**Example:**
```typescript
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`🚀 Batcher started on port ${publicConfig.port}`);
  console.log(`   Default target: ${publicConfig.defaultTarget}`);
  console.log(`   Adapters: ${publicConfig.adapterTargets.join(", ")}`);
});
```

---

#### 2. `http:start` – HTTP Server Started

**When:** HTTP server successfully starts.

**Payload:**
```typescript
{ port: number; time: number }
```

**Example:**
```typescript
batcher.addStateTransition("http:start", ({ port }) => {
  console.log(`🌐 HTTP API: http://localhost:${port}`);
  console.log(`📖 Docs: http://localhost:${port}/documentation`);
});
```

---

#### 3. `http:stop` – HTTP Server Stopped

**When:** HTTP server is stopped (usually during shutdown).

**Payload:**
```typescript
{ time: number }
```

---

#### 4. `poll:targets-ready` – Targets Ready for Batching

**When:** Polling detects one or more targets have met their batching criteria.

**Payload:**
```typescript
{ targets: string[]; time: number }
```

**Example:**
```typescript
batcher.addStateTransition("poll:targets-ready", ({ targets }) => {
  console.log(`📦 Ready to batch: ${targets.join(", ")}`);
});
```

---

#### 5. `batch:process:start` – Batch Processing Started

**When:** A batch processing operation begins for a specific target.

**Payload:**
```typescript
{ target: string; inputCount: number; time: number }
```

**Example:**
```typescript
batcher.addStateTransition("batch:process:start", ({ target, inputCount }) => {
  console.log(`⚙️ Processing ${inputCount} inputs for ${target}`);
  metrics.increment("batcher.batch.start", { target });
});
```

---

#### 6. `batch:fee-estimate` – Fee Estimated

**When:** Transaction fee has been estimated before submission.

**Payload:**
```typescript
{ target: string; estimatedFee: bigint; time: number }
```

**Example:**
```typescript
batcher.addStateTransition("batch:fee-estimate", ({ target, estimatedFee }) => {
  const feeEth = Number(estimatedFee) / 1e18;
  console.log(`💰 Estimated fee for ${target}: ${feeEth.toFixed(6)} ETH`);
});
```

---

#### 7. `batch:submit` – Batch Submitted to Blockchain

**When:** Transaction has been submitted to the blockchain.

**Payload:**
```typescript
{
  target: string;
  estimatedFee: bigint;
  txHash: string;
  time: number;
}
```

**Example:**
```typescript
batcher.addStateTransition("batch:submit", ({ target, txHash }) => {
  console.log(`🚀 Submitted to ${target}: ${txHash}`);
  database.recordSubmission(target, txHash);
});
```

---

#### 8. `batch:receipt` – Transaction Confirmed

**When:** Blockchain confirms the transaction (receipt received).

**Payload:**
```typescript
{
  target: string;
  blockNumber: number | bigint;
  time: number;
}
```

**Example:**
```typescript
batcher.addStateTransition("batch:receipt", ({ target, blockNumber }) => {
  console.log(`✅ Confirmed on ${target} in block ${blockNumber}`);
  metrics.increment("batcher.batch.confirmed", { target });
});
```

---

#### 9. `batch:effectstream-processed` – Paima Engine Processed

**When:** Paima Engine has processed the batch (only if waiting for `wait-effectstream-processed`).

**Payload:**
```typescript
{
  target: string;
  latestBlock: number;
  rollup: number;
  time: number;
}
```

**Example:**
```typescript
batcher.addStateTransition("batch:effectstream-processed", ({ target, rollup }) => {
  console.log(`🎯 Paima processed ${target} batch in rollup block ${rollup}`);
});
```

---

#### 10. `batch:process:end` – Batch Processing Complete

**When:** Batch processing finishes (successfully or with errors).

**Payload:**
```typescript
{
  target: string;
  processedCount: number;
  success: boolean;
  time: number;
}
```

**Example:**
```typescript
batcher.addStateTransition("batch:process:end", ({ target, processedCount, success }) => {
  if (success) {
    console.log(`✅ Processed ${processedCount} inputs for ${target}`);
  } else {
    console.error(`❌ Batch failed for ${target}`);
  }
});
```

---

#### 11. `error` – Error Occurred

**When:** An error occurs during any phase of batching.

**Payload:**
```typescript
{
  phase: string;      // e.g., "batch", "event-listener:startup"
  target?: string;    // Target name if error is target-specific
  error: unknown;     // The error object
  time: number;
}
```

**Example:**
```typescript
batcher.addStateTransition("error", ({ phase, target, error }) => {
  console.error(`❌ Error in ${phase}${target ? ` (${target})` : ""}:`, error);
  errorReporter.report({
    phase,
    target,
    error,
    timestamp: new Date().toISOString()
  });
});
```

---

### Event System Best Practices

#### 1. Use for Observability

```typescript
// Logging
batcher.addStateTransition("batch:submit", ({ target, txHash }) => {
  logger.info("Batch submitted", { target, txHash });
});

// Metrics
batcher.addStateTransition("batch:receipt", ({ target }) => {
  metrics.increment("batches.confirmed", { target });
});

// Tracing
batcher.addStateTransition("batch:process:start", ({ target, inputCount }) => {
  tracer.startSpan("batch.process", { target, inputCount });
});
```

#### 2. Error Handling in Listeners

Event listeners should **not throw errors**—they run in background fibers and failures don't affect the main batcher:

```typescript
batcher.addStateTransition("batch:submit", async ({ txHash }) => {
  try {
    await database.recordTransaction(txHash);
  } catch (error) {
    console.error("Failed to record transaction:", error);
    // Don't throw—just log and continue
  }
});
```

If a listener throws, the error is caught and emitted as an `"error"` event with `phase: "event-listener:<prefix>"`.

#### 3. Prevent Duplicate Listeners

The batcher **throws an error** if you register the same prefix twice:

```typescript
batcher.addStateTransition("startup", () => console.log("First"));
batcher.addStateTransition("startup", () => console.log("Second"));
// ❌ Error: "Disallowed: duplicate listener for prefix startup"
```

This prevents determinism issues. Use different prefixes or remove the old listener:

```typescript
batcher.removeStateTransition("startup");
batcher.addStateTransition("startup", () => console.log("Replaced"));
```

#### 4. Complete Monitoring Example

```typescript
// Startup
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`🚀 Batcher started`);
  console.log(`   Adapters: ${publicConfig.adapterTargets.join(", ")}`);
  metrics.gauge("batcher.adapters", publicConfig.adapterTargets.length);
});

// Batch lifecycle
batcher.addStateTransition("batch:process:start", ({ target, inputCount }) => {
  console.log(`⚙️ ${target}: Processing ${inputCount} inputs`);
  metrics.histogram("batcher.batch.size", inputCount, { target });
});

batcher.addStateTransition("batch:submit", ({ target, txHash, estimatedFee }) => {
  console.log(`🚀 ${target}: Submitted ${txHash}`);
  metrics.increment("batcher.txs.submitted", { target });
  metrics.histogram("batcher.fee", Number(estimatedFee), { target });
});

batcher.addStateTransition("batch:receipt", ({ target, blockNumber }) => {
  console.log(`✅ ${target}: Confirmed in block ${blockNumber}`);
  metrics.increment("batcher.txs.confirmed", { target });
});

// Errors
batcher.addStateTransition("error", ({ phase, target, error }) => {
  console.error(`❌ Error in ${phase}${target ? ` (${target})` : ""}:`, error);
  errorTracker.captureException(error, { phase, target });
  metrics.increment("batcher.errors", { phase, target: target || "global" });
});
```

---

## Storage System

Storage is the **single source of truth** for all pending inputs. There are no in-memory queues—everything is persisted immediately, making the batcher crash-safe.

### The `BatcherStorage` Interface

All storage backends implement this interface:

```typescript
interface BatcherStorage<T extends DefaultBatcherInput = DefaultBatcherInput> {
  /**
   * Initialize the storage (create directories, tables, etc.)
   */
  init(): Promise<void>;

  /**
   * Add a new input to storage
   */
  addInput(input: T): Promise<void>;

  /**
   * Get all pending inputs
   */
  getAllInputs(): Promise<T[]>;

  /**
   * Remove specific processed inputs from storage
   */
  removeProcessedInputs(processedInputs: T[]): Promise<void>;

  /**
   * Get the count and total size of pending inputs
   */
  getInputCountAndSize(): Promise<{ count: number; size: number }>;

  /**
   * Get all pending inputs for a specific target
   */
  getInputsByTarget(target: string, defaultTarget: string): Promise<T[]>;

  /**
   * Clear all inputs (useful for testing)
   */
  clearAllInputs(): Promise<void>;
}
```

---

### Built-in: `FileStorage`

The default storage backend uses JSONL (JSON Lines) files for simplicity and human readability.

**Usage:**
```typescript
import { FileStorage } from "@effectstream/batcher";

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);
```

**File Structure:**
```
./batcher-data/
  pending-inputs.jsonl  # One JSON object per line
```

**Example `pending-inputs.jsonl`:**
```jsonl
{"address":"0x742d35Cc...","addressType":0,"input":"move|x10y20","signature":"0x...","timestamp":"1234567890"}
{"address":"0xabc123...","addressType":0,"input":"attack|id5","signature":"0x...","timestamp":"1234567891"}
```

**Features:**
- ✅ **Simple**: No database setup required
- ✅ **Human-readable**: Easy to inspect and debug
- ✅ **Crash-safe**: Uses atomic file operations
- ⚠️ **Not for production**: Poor performance at scale

**Limitations:**
- **Not scalable**: Full file read/write on every operation
- **No transactions**: Can't guarantee atomicity across multiple operations
- **No indexing**: `getInputsByTarget()` scans entire file
- **Single machine**: Can't be shared across multiple batcher instances

---

### Custom Storage Implementations

Implement `BatcherStorage` to use any backend:

#### Example: PostgreSQL Storage

```typescript
import { Pool } from "pg";
import type { BatcherStorage, DefaultBatcherInput } from "@effectstream/batcher";

export class PostgreSQLStorage<T extends DefaultBatcherInput>
  implements BatcherStorage<T> {
  
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS batcher_inputs (
        id SERIAL PRIMARY KEY,
        address TEXT NOT NULL,
        address_type INTEGER NOT NULL,
        input TEXT NOT NULL,
        signature TEXT,
        timestamp TEXT NOT NULL,
        target TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_target ON batcher_inputs(target);
    `);
  }

  async addInput(input: T): Promise<void> {
    await this.pool.query(
      `INSERT INTO batcher_inputs (address, address_type, input, signature, timestamp, target)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.address,
        input.addressType,
        input.input,
        input.signature,
        input.timestamp,
        input.target || null
      ]
    );
  }

  async getAllInputs(): Promise<T[]> {
    const result = await this.pool.query(
      `SELECT * FROM batcher_inputs ORDER BY created_at ASC`
    );
    return result.rows.map(row => ({
      address: row.address,
      addressType: row.address_type,
      input: row.input,
      signature: row.signature,
      timestamp: row.timestamp,
      target: row.target
    })) as T[];
  }

  async removeProcessedInputs(processedInputs: T[]): Promise<void> {
    if (processedInputs.length === 0) return;
    
    // Use signature + timestamp as unique identifier
    const signatures = processedInputs.map(inp => inp.signature);
    await this.pool.query(
      `DELETE FROM batcher_inputs WHERE signature = ANY($1)`,
      [signatures]
    );
  }

  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count, 
              COALESCE(SUM(LENGTH(input)), 0) as size 
       FROM batcher_inputs`
    );
    return {
      count: parseInt(result.rows[0].count),
      size: parseInt(result.rows[0].size)
    };
  }

  async getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    const result = await this.pool.query(
      `SELECT * FROM batcher_inputs 
       WHERE target = $1 OR (target IS NULL AND $2 = $1)
       ORDER BY created_at ASC`,
      [target, defaultTarget]
    );
    return result.rows.map(row => ({
      address: row.address,
      addressType: row.address_type,
      input: row.input,
      signature: row.signature,
      timestamp: row.timestamp,
      target: row.target
    })) as T[];
  }

  async clearAllInputs(): Promise<void> {
    await this.pool.query(`TRUNCATE TABLE batcher_inputs`);
  }
}
```

**Usage:**
```typescript
const storage = new PostgreSQLStorage("postgresql://user:pass@localhost/batcher");
const batcher = createNewBatcher(config, storage);
```

---

#### Example: Redis Storage

```typescript
import Redis from "ioredis";
import type { BatcherStorage, DefaultBatcherInput } from "@effectstream/batcher";

export class RedisStorage<T extends DefaultBatcherInput>
  implements BatcherStorage<T> {
  
  private redis: Redis;
  private readonly queueKey = "batcher:pending-inputs";

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async init(): Promise<void> {
    // Redis doesn't require initialization
    await this.redis.ping();
  }

  async addInput(input: T): Promise<void> {
    await this.redis.rpush(this.queueKey, JSON.stringify(input));
  }

  async getAllInputs(): Promise<T[]> {
    const inputs = await this.redis.lrange(this.queueKey, 0, -1);
    return inputs.map(str => JSON.parse(str));
  }

  async removeProcessedInputs(processedInputs: T[]): Promise<void> {
    if (processedInputs.length === 0) return;
    
    // Remove by value (inefficient for large lists—consider using sorted sets instead)
    const pipeline = this.redis.pipeline();
    for (const input of processedInputs) {
      pipeline.lrem(this.queueKey, 1, JSON.stringify(input));
    }
    await pipeline.exec();
  }

  async getInputCountAndSize(): Promise<{ count: number; size: number }> {
    const count = await this.redis.llen(this.queueKey);
    const inputs = await this.redis.lrange(this.queueKey, 0, -1);
    const size = inputs.reduce((sum, str) => sum + str.length, 0);
    return { count, size };
  }

  async getInputsByTarget(target: string, defaultTarget: string): Promise<T[]> {
    const allInputs = await this.getAllInputs();
    return allInputs.filter(input => 
      input.target === target || (!input.target && defaultTarget === target)
    );
  }

  async clearAllInputs(): Promise<void> {
    await this.redis.del(this.queueKey);
  }
}
```

---

### Storage Best Practices

#### 1. Choose Based on Scale

| Scale | Recommended Storage |
|-------|-------------------|
| Development | `FileStorage` |
| Small production (< 1000 inputs/sec) | PostgreSQL with connection pooling |
| High throughput (> 1000 inputs/sec) | Redis with persistence enabled |
| Distributed batcher | PostgreSQL or Redis Cluster |

#### 2. Ensure Atomicity

Storage operations should be **atomic** to prevent race conditions:

```typescript
// ❌ Bad: Non-atomic read-modify-write
const inputs = await storage.getAllInputs();
const filtered = inputs.filter(/* ... */);
await storage.removeProcessedInputs(filtered);

// ✅ Good: Use removeProcessedInputs with exact inputs
await storage.removeProcessedInputs(processedInputs);
```

#### 3. Handle Crashes Gracefully

The batcher reloads all pending inputs from storage on restart:

```typescript
// After crash/restart:
await batcher.init();  // Reloads pending-inputs.jsonl
// All unprocessed inputs are still in the queue
```

#### 4. Monitor Storage Health

```typescript
// Periodically check queue depth
setInterval(async () => {
  const { count, size } = await storage.getInputCountAndSize();
  console.log(`Queue: ${count} inputs (${size} bytes)`);
  metrics.gauge("batcher.queue.size", count);
}, 60000);
```

#### 5. Implement Backup/Restore

For production storage, implement backup:

```typescript
// PostgreSQL: pg_dump
pg_dump -t batcher_inputs batcher_db > backup.sql

// Redis: SAVE or BGSAVE
redis-cli BGSAVE
```

---

---

## Effection Integration

The Batcher uses **Effection** for structured concurrency, providing automatic resource cleanup, graceful cancellation, and robust error handling. This section explains how to run the batcher using Effection's `main()` function.

### What is Effection?

[Effection](https://frontside.com/effection/) is a structured concurrency library for JavaScript/TypeScript that treats asynchronous operations as first-class values called **Operations**. It provides:

- **Automatic resource cleanup**: When an operation ends, all spawned child operations are automatically cancelled
- **Structured concurrency**: Operations form a tree where parent operations control child lifecycles
- **Graceful shutdown**: Cancelling a parent operation gracefully shuts down all children
- **Error propagation**: Errors bubble up the operation tree predictably

### Why Use Effection with the Batcher?

The batcher has two long-running concurrent tasks:
1. **HTTP Server** - Accepts incoming requests
2. **Polling Loop** - Periodically checks batching criteria

Effection ensures that:
- Both tasks start together
- If one fails, the other is automatically stopped
- On shutdown (Ctrl+C), both tasks are gracefully cancelled
- Resources (server sockets, timers) are automatically cleaned up

Without structured concurrency, you'd need manual bookkeeping to track and stop these tasks.

---

### Installation

Effection is available on both NPM and Deno:

**NPM/Yarn:**
```bash
npm install effection
# or
yarn add effection
```

**Deno:**
```typescript
import { main, suspend } from "https://jsr.io/@effection/effection/doc";
```

---

### Using `runBatcher()` with Effection

The batcher provides a `runBatcher()` operation that:
1. Initializes storage
2. Spawns the HTTP server (if enabled)
3. Spawns the polling loop
4. Keeps both running until cancelled

#### Basic Example

```typescript
import { main, suspend } from "effection";
import { PaimaBatcher } from "@effectstream/batcher";

const batcher = new PaimaBatcher(config, storage);

main(function* () {
  // Run the batcher (starts HTTP server and polling)
  yield* batcher.runBatcher();
  
  // Keep the main operation alive
  yield* suspend();
});
```

**What happens:**
- `main()` creates the root operation scope
- `batcher.runBatcher()` spawns HTTP server and polling loop
- `suspend()` keeps the operation alive indefinitely
- On Ctrl+C or error, Effection cancels all operations gracefully

---

### Complete Example with Event Listeners

Here's a production-ready example from the E2E tests:

```typescript
import { main, suspend } from "effection";
import { PaimaBatcher } from "@effectstream/batcher";
import { config, storage } from "./config.ts";

const batcher = new PaimaBatcher(config, storage);

// Add event listeners before starting
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`🚀 Batcher started`);
  console.log(`   Default Target: ${publicConfig.defaultTarget}`);
  console.log(`   Adapters: ${publicConfig.adapterTargets.join(", ")}`);
  console.log(`   Polling: ${publicConfig.pollingIntervalMs}ms`);
});

batcher.addStateTransition("http:start", ({ port }) => {
  console.log(`🌐 HTTP Server: http://localhost:${port}`);
  console.log(`📖 Docs: http://localhost:${port}/documentation`);
});

batcher.addStateTransition("error", ({ phase, error }) => {
  console.error(`❌ Error in ${phase}:`, error);
});

main(function* () {
  console.log("🚀 Starting Batcher...");
  
  try {
    // Run the batcher with Effection structured concurrency
    yield* batcher.runBatcher();
  } catch (error) {
    console.error("❌ Batcher error:", error);
    // Trigger graceful shutdown on error
    yield* batcher.gracefulShutdownOp();
  }
  
  // Keep the main operation alive
  yield* suspend();
});
```

**Output:**
```
🚀 Starting Batcher...
🚀 Batcher started
   Default Target: ethereum
   Adapters: ethereum, polygon
   Polling: 1000ms
🌐 HTTP Server: http://localhost:3334
📖 Docs: http://localhost:3334/documentation
```

---

### Alternative: Manual Initialization

If you need more control, you can initialize manually:

```typescript
import { main, suspend, spawn, sleep, call } from "effection";

const batcher = new PaimaBatcher(config, storage);

main(function* () {
  // 1. Initialize storage
  yield* call(() => batcher.storage.init());
  batcher.isInitialized = true;
  
  // 2. Emit startup event
  yield* batcher.emitStateTransition("startup", {
    publicConfig: batcher.getPublicConfig(),
    time: Date.now()
  });
  
  // 3. Start HTTP server (if enabled)
  if (config.enableHttpServer) {
    yield* spawn(() => batcher.runHttpServer());
  }
  
  // 4. Start polling loop
  yield* spawn(function* () {
    while (true) {
      yield* sleep(config.pollingIntervalMs);
      yield* call(() => batcher.pollBatcher());
    }
  });
  
  yield* suspend();
});
```

**When to use this:**
- You need to perform custom initialization steps
- You want to add middleware between initialization and startup
- You're integrating with other Effection-based systems

---

### Graceful Shutdown with Effection

Effection automatically handles Ctrl+C (SIGINT) and SIGTERM signals:

```typescript
main(function* () {
  yield* batcher.runBatcher();
  yield* suspend();
});
// Press Ctrl+C:
// 1. Effection cancels all operations
// 2. HTTP server stops
// 3. Polling loop stops
// 4. Batcher cleanup runs
// 5. Process exits
```

**For custom shutdown logic**, use `gracefulShutdownOp()`:

```typescript
main(function* () {
  try {
    yield* batcher.runBatcher();
    yield* suspend();
  } finally {
    // Always runs on cancellation
    console.log("Shutting down...");
    yield* batcher.gracefulShutdownOp({
      cleanup: async () => {
        console.log("Custom cleanup");
        await database.disconnect();
      }
    });
  }
});
```

---

### Error Handling

Effection propagates errors up the operation tree:

```typescript
main(function* () {
  try {
    yield* batcher.runBatcher();
    yield* suspend();
  } catch (error) {
    // Catch errors from HTTP server or polling loop
    console.error("Batcher failed:", error);
    
    // Attempt graceful shutdown
    try {
      yield* batcher.gracefulShutdownOp();
    } catch (shutdownError) {
      console.error("Shutdown failed:", shutdownError);
    }
    
    // Re-throw or exit
    throw error;
  }
});
```

**Error scenarios:**
- **HTTP server fails to start**: Error caught, shutdown triggered
- **Polling loop throws**: Error caught, HTTP server automatically stopped
- **Adapter submission fails**: Error logged, polling continues (errors don't crash the batcher)

---

### Running Multiple Batchers

Use Effection to run multiple batcher instances:

```typescript
import { main, suspend, spawn } from "effection";

const batcher1 = new PaimaBatcher(config1, storage1);
const batcher2 = new PaimaBatcher(config2, storage2);

main(function* () {
  // Run both batchers concurrently
  yield* spawn(() => batcher1.runBatcher());
  yield* spawn(() => batcher2.runBatcher());
  
  console.log("Both batchers running");
  yield* suspend();
});
```

If either batcher fails, both are automatically stopped.

---

### Effection Operations Reference

The batcher provides these Effection operations:

#### `runBatcher(): Operation<void>`

Complete batcher lifecycle: initialize storage, start HTTP server, start polling loop.

```typescript
main(function* () {
  yield* batcher.runBatcher();
  yield* suspend();
});
```

---

#### `runHttpServer(): Operation<void>`

Start only the HTTP server (useful for custom setups).

```typescript
main(function* () {
  yield* call(() => batcher.storage.init());
  yield* batcher.runHttpServer();  // Just HTTP, no polling
  yield* suspend();
});
```

---

#### `runPollingLoop(): Operation<void>`

Start only the polling loop (useful for custom setups).

```typescript
main(function* () {
  yield* call(() => batcher.storage.init());
  yield* batcher.runPollingLoop();  // Just polling, no HTTP
  yield* suspend();
});
```

---

#### `gracefulShutdownOp(hooks?, options?): Operation<void>`

Gracefully shut down the batcher with custom hooks.

```typescript
main(function* () {
  yield* batcher.runBatcher();
  
  // Somewhere else, trigger shutdown:
  yield* batcher.gracefulShutdownOp({
    cleanup: async () => {
      console.log("Cleaning up...");
    }
  }, { timeoutMs: 30000 });
});
```

---

#### `emitStateTransition(prefix, payload): Operation<void>`

Emit state transition events (used internally).

```typescript
main(function* () {
  yield* batcher.emitStateTransition("custom:event", {
    message: "Something happened",
    time: Date.now()
  });
});
```

---

### Best Practices

#### 1. Always Use `main()` for Production

```typescript
// ✅ Good: Structured concurrency
main(function* () {
  yield* batcher.runBatcher();
  yield* suspend();
});

// ❌ Bad: Manual async/await
async function run() {
  await batcher.init();
  // No automatic cleanup, shutdown logic required
}
run();
```

#### 2. Use `spawn()` for Background Tasks

```typescript
main(function* () {
  yield* batcher.runBatcher();
  
  // Run metrics collector in background
  yield* spawn(function* () {
    while (true) {
      yield* sleep(60000);
      const stats = yield* call(() => batcher.getBatchingStatus());
      metrics.gauge("queue.size", stats.totalPendingInputs);
    }
  });
  
  yield* suspend();
});
```

#### 3. Handle Errors Gracefully

```typescript
main(function* () {
  try {
    yield* batcher.runBatcher();
    yield* suspend();
  } catch (error) {
    console.error("Fatal error:", error);
    yield* batcher.gracefulShutdownOp();
    Deno.exit(1);  // or process.exit(1) in Node
  }
});
```

#### 4. Add Event Listeners Before Starting

```typescript
// ✅ Good: Listeners registered before runBatcher()
batcher.addStateTransition("startup", () => console.log("Started"));
main(function* () {
  yield* batcher.runBatcher();
});

// ⚠️ Bad: Listener might miss startup event
main(function* () {
  yield* batcher.runBatcher();
  batcher.addStateTransition("startup", () => console.log("Started"));
});
```

---

### Comparison: Effection vs Manual Async/Await

**Manual Async/Await:**
```typescript
async function runBatcher() {
  await batcher.init();
  
  // Start HTTP server
  const server = await batcher.startHttpServer();
  
  // Start polling
  const pollingInterval = setInterval(() => {
    batcher.pollBatcher().catch(console.error);
  }, 1000);
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    clearInterval(pollingInterval);
    await server.close();
    await batcher.gracefulShutdown();
    process.exit(0);
  });
}
runBatcher();
```

**Problems:**
- Manual cleanup tracking
- Race conditions in shutdown
- Error handling is complex
- No automatic resource cleanup

**With Effection:**
```typescript
main(function* () {
  yield* batcher.runBatcher();
  yield* suspend();
});
```

**Benefits:**
- Automatic cleanup
- Structured shutdown
- Error propagation
- 4 lines instead of 20+

---

## Summary

This guide covered five advanced topics:

1. **HTTP API**: REST endpoints for input submission (`/send-input`), monitoring (`/status`, `/queue-stats`), and developer operations (`/force-batch`, `/clear-inputs`)

2. **Batching Criteria**: Five strategies for controlling batch submission timing—time, size, value, hybrid, and custom—each with distinct use cases

3. **Event System**: Lifecycle hooks for observability, emitting events like `startup`, `batch:submit`, `batch:receipt`, and `error` for monitoring and integration

4. **Storage System**: The `BatcherStorage` interface enables pluggable persistence backends, with `FileStorage` for development and custom implementations for production (PostgreSQL, Redis, etc.)

5. **Effection Integration**: Structured concurrency using `main()` and `runBatcher()` for automatic resource cleanup, graceful shutdown, and robust error handling

Together, these features provide the foundation for building production-grade batching systems with observability, flexibility, and reliability.

## Next Steps

- Review [Configuration](./1240-configuration.md) for complete setup options
- Explore [Custom Adapters](./1250-adapter.md) to support new blockchains
- Study [Core Concepts](./1220-core-concepts.md) for architectural understanding
- Check [The Batching Pipeline](./1230-batching-pipeline.md) for input lifecycle details
- Read [Effection Documentation](https://frontside.com/effection/) for advanced concurrency patterns
