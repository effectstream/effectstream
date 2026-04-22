# The Batching Pipeline

## Overview

Understanding how an input flows through the Batcher system is essential for effective integration and customization. This document provides a comprehensive, step-by-step overview of an input's lifecycle—from the initial API call to final chain confirmation.

This knowledge helps you:
- Understand where adapter customization hooks in
- Configure appropriate confirmation levels for your use case
- Debug issues in the batching flow
- Optimize batch submission timing

## Target Audience

Developers building on or integrating with the Effectstream platform who need to batch transactions, especially those who want to:
- Customize adapter behavior for different blockchains
- Understand validation and security guarantees
- Configure confirmation levels appropriately
- Implement custom batching strategies

## The Input Lifecycle

Every input submitted to the Batcher goes through a well-defined pipeline. Here's the complete journey:

### Step 1: Ingestion

An HTTP POST request is made to the `/send-input` endpoint with a payload conforming to the `DefaultBatcherInput` type:

```typescript
{
  "data": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "addressType": 0,  // EVM address type
    "input": "myGameCommand|arg1|arg2",
    "signature": "0x...",
    "timestamp": "1234567890",
    "target": "evm"  // Optional, uses defaultTarget if not specified
  },
  "confirmationLevel": "wait-receipt"  // Optional
}
```

The API accepts the request and begins processing it through the pipeline.

### Step 2: Targeting

The batcher examines the `input.target` field to determine which blockchain adapter should handle this input. If `target` is not provided, it falls back to the `defaultTarget` specified in the `BatcherConfig`.

For example, if your configuration has:
```typescript
{
  adapters: { 
    evm: evmAdapter, 
    midnight: midnightAdapter 
  },
  defaultTarget: "evm"
}
```

Then an input without a `target` field will be routed to the `evmAdapter`.

### Step 3: Validation (Adapter-Driven)

Once the target adapter is identified, the batcher performs two crucial validation steps **before** the input is queued:

#### 3a. Signature Verification

The batcher calls the adapter's `verifySignature()` method. This is adapter-specific because different blockchains have different signature schemes:

- **EVM adapters**: Use the default EVM signature verification (via `CryptoManager.Evm().verifySignature()`)
- **Custom adapters**: Can override this method to implement their own logic or bypass it entirely

```typescript
verifySignature(input: DefaultBatcherInput): boolean {
  // Bypass the default EVM signature check
  return true;
}
```

If signature verification fails, the input is **rejected immediately** with a `401 Unauthorized` error.

#### 3b. Input Validation

The adapter's `validateInput()` method is called to perform semantic validation specific to that blockchain:

- Check circuit argument formats (e.g., for zero-knowledge chains)
- Validate payload structure
- Verify account formats
- Check any other chain-specific requirements

```typescript
// Example validation
validateInput(input: DefaultBatcherInput): ValidationResult {
  if (!isValidCircuitArgs(input.input)) {
    return { 
      valid: false, 
      error: "Invalid circuit arguments format" 
    };
  }
  return { valid: true };
}
```

If validation fails, the input is **rejected immediately** with a `400 Bad Request` error containing the validation error message.

:::tip Why Validate Before Queuing?
Pre-queue validation ensures that only valid inputs reach persistent storage. This prevents storage pollution and makes the system more robust during restarts and crashes.
:::

### Step 4: Queuing

After passing validation, the input is saved to the `BatcherStorage` (e.g., `FileStorage`, PostgreSQL, Redis).

**Important**: Storage is the single source of truth. There are no in-memory queues that could be lost on restart.

#### Confirmation Level: "no-wait"

If `confirmationLevel` is set to `"no-wait"`, the API call **returns immediately** at this point with a success response:

```json
{
  "success": true,
  "message": "Input queued for batching",
  "inputsProcessed": 1
}
```

The caller doesn't wait for the batch to be submitted or confirmed.

### Step 5: Polling & Criteria Check

The `Batcher` runs independent polling loops for each adapter target at intervals defined by `pollingIntervalMs` (e.g., every 1000ms). On each iteration for a specific target:

1. The batcher checks the batching criteria for that target
2. The criteria determine if enough inputs have accumulated or enough time has passed
3. Because loops are independent, a slow adapter (e.g., waiting for confirmation on a slow chain) does not block the polling or processing of other adapters.

#### Batching Criteria Types

| Criteria Type | Description | Example |
|--------------|-------------|---------|
| **time** | Submit every N milliseconds | `{ criteriaType: "time", timeWindowMs: 5000 }` |
| **size** | Submit when N inputs accumulate | `{ criteriaType: "size", maxBatchSize: 10 }` |
| **value** | Submit when accumulated value reaches threshold | `{ criteriaType: "value", targetValue: 100 }` |
| **hybrid** | Submit when time OR size criteria met | `{ criteriaType: "hybrid", timeWindowMs: 5000, maxBatchSize: 10 }` |
| **custom** | Custom function determines readiness | `{ criteriaType: "custom", isBatchReadyFn: (inputs) => {...} }` |

Example configuration:
```typescript
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
```

When the criteria for a target is satisfied, the batcher proceeds to build and submit the batch.

### Step 6: Building (Adapter-Driven)

Once a target is ready for batching, the batcher:

1. Retrieves pending inputs for that target from storage
2. Calls the adapter's `buildBatchData()` method with these inputs

The adapter's `buildBatchData()` method is responsible for:
- Serializing inputs into a blockchain-specific format
- Handling size constraints (respecting `maxBatchSize`)
- Deciding which inputs to include or exclude
- Returning the final batch payload

```typescript
interface BatchBuildingResult<TOutput> {
  selectedInputs: DefaultBatcherInput[];  // Inputs included in this batch
  data: TOutput;  // Serialized batch data (format depends on chain)
}
```

For example:
- **EVM adapters** might serialize to a hex string
- **Midnight adapters** might construct circuit arguments
- **Custom adapters** can use any format their chain accepts

### Step 7: Submission (Adapter-Driven)

The batcher calls the adapter's `submitBatch()` method, passing:
- The serialized data from Step 6
- An estimated fee (obtained via `estimateBatchFee()`)

```typescript
const fee = await adapter.estimateBatchFee(data);
const txHash = await adapter.submitBatch(data, fee);
```

The adapter handles all blockchain-specific submission logic:
- Constructing the transaction
- Signing it with the configured private key
- Submitting it to the RPC endpoint
- Returning the transaction hash

State transition event `batch:submit` is emitted at this point.

### Step 8: Confirmation (Adapter-Driven)

After submission, the batcher calls `adapter.waitForTransactionReceipt()` to wait for the transaction to be included in a block.

The adapter polls the blockchain until:
- The transaction is confirmed (successful receipt)
- An error occurs
- A timeout is reached

Once the receipt is obtained:
- The processed inputs are **removed from storage**
- State transition event `batch:receipt` is emitted

#### Confirmation Level: "wait-receipt"

If `confirmationLevel` is `"wait-receipt"`, the API call **returns at this point**:

```json
{
  "success": true,
  "message": "Input processed successfully",
  "transactionHash": "0xabc...",
  "inputsProcessed": 1
}
```

### Step 9: Effectstream Processing (Optional)

After blockchain confirmation, the batcher optionally waits for the Effectstream to process the batch. This step:

1. Monitors Effectstream Sync events for the specific transaction
2. Waits until the Effectstream has parsed and validated the inputs
3. Returns the rollup block number where processing occurred

#### Confirmation Level: "wait-effectstream-processed"

If `confirmationLevel` is `"wait-effectstream-processed"`, the API call **waits until this step completes**:

```json
{
  "success": true,
  "message": "Input processed and validated by Effectstream",
  "transactionHash": "0xabc...",
  "rollup": 12345,
  "inputsProcessed": 1
}
```

This provides the strongest guarantee: the input has been confirmed on-chain **and** processed by your game/application logic.

### Step 10: Callback Resolution

Finally, the original API caller receives the response based on their configured `confirmationLevel`.

All waiting callers whose inputs were included in this batch are resolved simultaneously.

## Confirmation Level Fallback Logic

If `confirmationLevel` is not explicitly provided in the API call, the batcher uses this fallback hierarchy:

1. **Target-specific configuration**: Check if `BatcherConfig.confirmationLevel` is an object with a key matching the target:
   ```typescript
   confirmationLevel: { 
     evm: "no-wait", 
     midnight: "wait-receipt" 
   }
   ```

2. **Global configuration**: If `confirmationLevel` is a string, use it for all targets:
   ```typescript
   confirmationLevel: "wait-receipt"
   ```

3. **Default**: If nothing is configured, default to `"wait-receipt"`

## Pipeline Visualization

```
┌─────────────────────────────────────────────────────────────┐
│  1. HTTP POST /send-input                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Target Selection (use input.target or defaultTarget)    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Validation (Adapter-Driven)                             │
│     • verifySignature() - Check cryptographic signature     │
│     • validateInput() - Semantic validation                 │
│                                                              │
│  ❌ Fails → 400/401 error returned immediately              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Save to BatcherStorage                                  │
│                                                              │
│  🔹 confirmationLevel: "no-wait" → API returns here         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Polling Loop (every pollingIntervalMs)                  │
│     Check batchingCriteria for each target                  │
│     Ready? → Proceed to build                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  6. adapter.buildBatchData()                                │
│     Serialize inputs → blockchain-specific format           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  7. adapter.submitBatch(data, fee)                          │
│     Submit transaction to blockchain                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  8. adapter.waitForTransactionReceipt()                     │
│     Wait for blockchain confirmation                        │
│     Remove processed inputs from storage                    │
│                                                              │
│  🔹 confirmationLevel: "wait-receipt" → API returns here    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  9. Wait for Effectstream Processing (Optional)             │
│     Monitor Effectstream Sync events                        │
│     Wait for rollup block processing                        │
│                                                              │
│  🔹 confirmationLevel: "wait-effectstream-processed" → returns here│
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  10. Callback Resolution                                    │
│      Return final response to API caller                    │
└─────────────────────────────────────────────────────────────┘
```

## Key Takeaways

1. **Validation happens before queuing**: Invalid inputs never reach storage
2. **Storage is crash-safe**: Inputs persist through restarts
3. **Adapters control key operations**: Signature verification, validation, building, and submission are all adapter-specific
4. **Confirmation levels offer flexibility**: Choose between immediate return, blockchain confirmation, or full Effectstream processing
5. **Per-target configuration**: Different blockchain targets can have different criteria and confirmation levels
6. **Event-driven observability**: State transitions emit events throughout the pipeline for monitoring and logging

## Next Steps

- Learn about [Custom Adapters](./1250-adapter.md) to support new blockchains
- Explore [Batching Criteria](./1290-advanced-topics.md#batching-criteria) for advanced batch timing strategies
- Review [Configuration Reference](./1240-configuration.md) for all available options