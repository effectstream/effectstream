# Core Concepts

Before diving into customization and advanced features, it's essential to understand the main components ("nouns") of the Batcher system. These building blocks work together to provide a flexible, multi-chain batching solution.

---

## Batcher

The **`Batcher`** is the main service instance that orchestrates all batching operations. It's created using the `createNewBatcher()` factory function and manages the entire lifecycle of input collection, batch processing, and blockchain submission.

**Key Responsibilities:**
- Accepts user inputs via the `batchInput()` method or HTTP API
- Stores inputs persistently using pluggable storage backends
- Evaluates batching criteria to determine when to process batches
- Coordinates with blockchain adapters to submit transactions
- Emits state transition events for observability
- Manages graceful shutdown and resource cleanup

**Type Signature:**
```typescript
class Batcher<T extends DefaultBatcherInput = DefaultBatcherInput>
```

The generic type parameter `T` allows you to extend `DefaultBatcherInput` with custom fields for your specific use case.

**Example:**
```typescript
import { createNewBatcher, FileStorage } from "@effectstream/batcher-sdk";

const batcher = createNewBatcher(
  {
    pollingIntervalMs: 1000,
    adapters: { ethereum: ethAdapter },
    defaultTarget: "ethereum",
  },
  new FileStorage("./batcher-data")
);

// Add custom event listeners
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`🚀 Batcher started on port ${publicConfig.port}`);
});

// Run the batcher
await batcher.init();
```

**See Also:** The batcher uses **Effection** for structured concurrency, enabling automatic resource cleanup and graceful cancellation.

---

## Target

A **target** is a string identifier that represents a specific blockchain destination. Each target corresponds to exactly one blockchain adapter in your configuration.

**Purpose:**
- Routes inputs to the correct blockchain adapter
- Allows batching criteria to be configured per blockchain
- Enables multi-chain batching in a single batcher instance

**Common Examples:**
- `"ethereum"` - For EVM-based chains like Ethereum mainnet
- `"polygon"` - For Polygon network
- `"midnight"` - For privacy-focused Midnight network
- `"effectstreamL2"` - For the default EffectStream L2 contract

**Usage in Input:**
```typescript
const input: DefaultBatcherInput = {
  addressType: AddressType.EVM,
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  input: "myGameMove|x5y10",
  signature: "0x...",
  timestamp: "1234567890",
  target: "ethereum", // Specifies the destination chain
};
```

If `target` is not specified in the input, the batcher uses the `defaultTarget` from the configuration.

---

## BatcherConfig

The **`BatcherConfig`** is the configuration object that defines global batcher settings and per-adapter behavior. It's provided when creating a new batcher instance.

**Type Signature:**
```typescript
interface BatcherConfig<
  TInput extends DefaultBatcherInput = DefaultBatcherInput,
  TAdapters extends Record<string, BlockchainAdapter<any>> = Record<string, BlockchainAdapter<any>>
>
```

### Core Configuration Fields

```typescript
{
  // Required: How often to check batching criteria (in milliseconds)
  pollingIntervalMs: number;

  // Optional: Blockchain adapters keyed by target name
  adapters?: TAdapters;

  // Optional: Default adapter when input.target not specified
  defaultTarget?: string;

  // Optional: Per-adapter batching rules
  batchingCriteria?: {
    [targetName: string]: {
      criteriaType: "time" | "size" | "value" | "hybrid" | "custom";
      timeWindowMs?: number;        // For time/hybrid criteria
      maxBatchSize?: number;        // For size/hybrid criteria (number of inputs)
      targetValue?: number;         // For value criteria
      valueAccumulatorFn?: (input: T) => number;  // For value criteria
      isBatchReadyFn?: (inputs: T[], lastProcessTime: number) => boolean | Promise<boolean>;  // For custom criteria
    };
  };

  // Optional: Default confirmation behavior for HTTP API requests
  // Can be a global default OR per-adapter
  confirmationLevel?: 
    | "no-wait" | "wait-receipt" | "wait-effectstream-processed"
    | Record<string, "no-wait" | "wait-receipt" | "wait-effectstream-processed">;

  // Optional: HTTP server settings
  enableHttpServer?: boolean;
  port?: number;

  // Optional: Event system
  enableEventSystem?: boolean;

  // Optional: Signature namespace for verification
  namespace?: string;
}
```

### Confirmation Level: Global Default for HTTP API

The `confirmationLevel` configuration defines the **default waiting behavior** when inputs are submitted via the HTTP API without an explicit confirmation level. It does **not** affect the internal batch processing-it only controls what happens after an input is queued.

**Three Levels:**
- **`"no-wait"`** - Returns immediately after input is queued
- **`"wait-receipt"`** - Waits for blockchain transaction confirmation (default)
- **`"wait-effectstream-processed"`** - Waits until EffectStream processes the batch

**Global vs Per-Adapter:**
```typescript
// Option 1: Single global default for all adapters
confirmationLevel: "wait-receipt"

// Option 2: Per-adapter defaults
confirmationLevel: {
  ethereum: "wait-receipt",      // Fast finality
  polygon: "wait-effectstream-processed", // Wait for full processing
}
```

**When is it used?**
- HTTP API calls to `/send-input` that don't specify a `confirmationLevel` field
- The `batchInput()` method's second parameter overrides this default

**Example HTTP API Request:**
```bash
# Uses the global confirmationLevel default
curl -X POST http://localhost:3334/send-input \
  -H "Content-Type: application/json" \
  -d '{"data": {...}}'

# Explicitly overrides the default
curl -X POST http://localhost:3334/send-input \
  -H "Content-Type: application/json" \
  -d '{"data": {...}, "confirmationLevel": "no-wait"}'
```

### Example Configuration

```typescript
const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  
  // Configure multiple adapters for multi-chain support
  adapters: {
    ethereum: new EffectstreamL2DefaultAdapter(
      "0x...", // Contract address
      "0x...", // Private key
      0n,      // Fee
      "eth-mainnet" // Sync protocol name
    ),
    polygon: new EffectstreamL2DefaultAdapter(
      "0x...",
      "0x...",
      0n,
      "polygon-mainnet"
    ),
  },
  
  defaultTarget: "ethereum",
  
  // Per-adapter batching criteria
  batchingCriteria: {
    ethereum: { // Sends batch every 5s
      criteriaType: "time", 
      timeWindowMs: 5000 
    },
    polygon: { // Sends batch every 3s or whenever batch size reaches 50 items
      criteriaType: "hybrid", 
      timeWindowMs: 3000, 
      maxBatchSize: 50  // This is NUMBER OF INPUTS (not bytes)
    },
  },
  
  confirmationLevel: "wait-receipt",
  enableHttpServer: true,
  port: 3334,
  enableEventSystem: true,
};
```

### Understanding maxBatchSize: Two Different Concepts

There are **two different `maxBatchSize` settings** that serve different purposes:

1. **Batching Criteria's `maxBatchSize`** (in config.batchingCriteria)
   - **Unit**: Number of inputs
   - **Purpose**: Triggers batch processing when input count reaches threshold
   - **Example**: `maxBatchSize: 50` means "process batch when 50 inputs are queued"

2. **Adapter's `maxBatchSize`** (a constructor argument on the individual adapters, not a member of the `BlockchainAdapter` interface)
   - **Unit**: Bytes
   - **Purpose**: Limits the serialized batch payload size during `buildBatchData()`
   - **Example**: `maxBatchSize: 10000` means "stop adding inputs to batch when it reaches 10KB"

**Example showing both:**
```typescript
const ethereumAdapter = new EffectstreamL2DefaultAdapter(
  "0x...",
  "0x...",
  0n,
  "eth-mainnet",
  chains.mainnet,
  10000  // Adapter maxBatchSize: 10KB limit for serialized data
);

const config: BatcherConfig = {
  adapters: { ethereum: ethereumAdapter },
  batchingCriteria: {
    ethereum: {
      criteriaType: "size",
      maxBatchSize: 100  // Criteria maxBatchSize: trigger after 100 inputs
    }
  }
};
```

**What happens?**
1. Batcher queues inputs until it has **100 inputs** (criteria threshold)
2. When processing, `buildBatchData()` serializes inputs until reaching **10KB** (adapter limit)
3. If 100 inputs exceed 10KB, only a subset fits in the batch; remaining inputs stay queued
4. Next polling cycle will process the remaining inputs

### Default Values

The batcher applies sensible defaults for optional fields:
- `port`: 3000
- `enableHttpServer`: true
- `enableEventSystem`: false
- `confirmationLevel`: "wait-receipt"
- `namespace`: "effectstream_batcher"
- `pollingIntervalMs`: 1000

---

## BlockchainAdapter

The **`BlockchainAdapter`** is the primary interface for customization. It acts as a "driver" for a specific blockchain, abstracting away chain-specific differences and providing a unified interface for the batcher.

**Type Signature:**
```typescript
interface BlockchainAdapter<TOutput>
```

The generic type parameter `TOutput` represents the type of data that `buildBatchData()` produces. This could be a string, a byte array, or a custom structure depending on your chain's requirements.

### Core Responsibilities

1. **Pre-queue Validation** - Validate inputs before they're added to storage
2. **Signature Verification** - Verify cryptographic signatures (or opt-out for chains without signatures)
3. **Batch Data Building** - Serialize multiple inputs into a single batch payload
4. **Transaction Submission** - Submit the batch to the blockchain
5. **Confirmation Tracking** - Wait for transaction confirmation

### Key Methods

```typescript
interface BlockchainAdapter<TOutput> {
  // Build batch data from inputs
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<TOutput> | null;

  // Submit batch to blockchain
  submitBatch(data: TOutput, fee: string | bigint): Promise<BlockchainHash>;

  // Wait for transaction confirmation
  waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout?: number
  ): Promise<BlockchainTransactionReceipt>;

  // Estimate transaction fee
  estimateBatchFee(data: TOutput): Promise<string | bigint> | string | bigint;

  // Get adapter information
  getAccountAddress(): string;
  getChainName(): string;
  getSyncProtocolName?(): string;
  isReady(): boolean;
  getBlockNumber(): Promise<bigint>;

  // Optional: Custom signature verification
  verifySignature?(input: DefaultBatcherInput): boolean | Promise<boolean>;

  // Optional: Pre-queue input validation
  validateInput?(input: DefaultBatcherInput): ValidationResult | Promise<ValidationResult>;

  // Optional: Maximum batch payload size in bytes
  // Used by buildBatchData() to limit the serialized batch size
  // Note: This is different from batching criteria's maxBatchSize (which counts inputs)
  maxBatchSize?: number;
}
```

### Example: EffectstreamL2DefaultAdapter

The built-in `EffectstreamL2DefaultAdapter` provides a complete EVM implementation:

```typescript
export class EffectstreamL2DefaultAdapter implements BlockchainAdapter<string> {
  constructor(
    effectstreamL2Address: EvmAddress,
    batcherPrivateKey: EvmPrivateKey,
    effectstreamL2Fee: bigint,
    effectstreamSyncProtocolName: string,
    chain: Chain = chains.hardhat,
    maxBatchSize: number = 10000
  ) {
    // ... initialization
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<string> | null {
    // Uses DefaultBatchBuilderLogic to create JSON batch data
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }

  async submitBatch(data: string, fee?: string | bigint): Promise<BlockchainHash> {
    // Submits to EffectstreamL2 contract via viem
    const hexData = encodeHexFromString(data);
    const hash = await this.walletClient.writeContract({
      address: this.effectstreamL2Address,
      abi: this.effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [hexData],
      value: actualFee,
    });
    return hash;
  }

  // ... other methods
}
```

### Custom Adapter Example

For a non-EVM chain like Midnight (which uses zero-knowledge proofs and doesn't have traditional signatures):

```typescript
export class MidnightAdapter implements BlockchainAdapter<MidnightBatchPayload> {
  // Override signature verification to skip it
  verifySignature(input: DefaultBatcherInput): boolean {
    // Midnight uses circuit-based validation, not signatures
    return true;
  }

  // Implement custom input validation
  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    // Validate circuit arguments format
    const args = this.parseCircuitArgs(input);
    if (!args) {
      return { valid: false, error: "Invalid circuit arguments" };
    }
    return { valid: true };
  }

  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<MidnightBatchPayload> | null {
    // Custom batch building for Midnight
    // ...
  }

  async submitBatch(data: MidnightBatchPayload, fee: string | bigint): Promise<BlockchainHash> {
    // Submit to Midnight network using their SDK
    // ...
  }
}
```

**Key Insight:** By implementing the `BlockchainAdapter` interface, you can integrate any blockchain into the batcher system, regardless of its underlying technology.

---

## DefaultBatcherInput

The **`DefaultBatcherInput`** is the standard JSON object structure expected by the batcher's `/send-input` API and `batchInput()` method. It acts as a "common envelope" containing essential fields for batching.

**Type Definition:**
```typescript
interface DefaultBatcherInput {
  addressType: AddressType;  // e.g., AddressType.EVM
  address: string;            // User's wallet address
  input: string;              // The actual game/application input
  signature?: string;         // Optional cryptographic signature
  timestamp: string;          // Timestamp for ordering and signature verification
  target?: string;            // Optional destination chain
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `addressType` | `AddressType` | Yes | The type of address (EVM, Algorand, Cardano, etc.) |
| `address` | `string` | Yes | The user's wallet address or identifier |
| `input` | `string` | Yes | The application-specific input data |
| `signature` | `string` | No | Cryptographic signature (required for chains with signature verification) |
| `timestamp` | `string` | Yes | Unix timestamp in milliseconds |
| `target` | `string` | No | Destination chain identifier (defaults to `defaultTarget`) |

### Extensibility: The Power of Generics

**The `DefaultBatcherInput` type is designed to be extended with custom fields.** This is crucial for supporting chain-specific or application-specific data.

**Example: Extending for Midnight Circuit Arguments**

Midnight requires circuit arguments instead of signatures:

```typescript
interface MidnightBatcherInput extends DefaultBatcherInput {
  circuitArgs?: string;  // JSON-encoded circuit arguments
  proof?: string;        // Zero-knowledge proof data
}

// Create a batcher with custom input type
const batcher = new Batcher<MidnightBatcherInput>(
  {
    pollingIntervalMs: 1000,
    adapters: { midnight: midnightAdapter },
    defaultTarget: "midnight",
  },
  storage
);

// Now batchInput() accepts MidnightBatcherInput
await batcher.batchInput({
  addressType: AddressType.EVM,
  address: "0x...",
  input: "myGameMove",
  timestamp: Date.now().toString(),
  circuitArgs: JSON.stringify({ /* ... */ }),  // Custom field!
  proof: "0x...",                              // Custom field!
});
```

**Example: Extending for Priority Fees**

Add priority levels for custom batching logic:

```typescript
interface PriorityBatcherInput extends DefaultBatcherInput {
  priority: "low" | "medium" | "high";
  maxFee?: bigint;
}

const batcher = new Batcher<PriorityBatcherInput>(config, storage);

// Custom batching criteria using the priority field
const criteria: BatchingCriteriaConfig<PriorityBatcherInput> = {
  criteriaType: "custom",
  isBatchReadyFn: (inputs) => {
    // Process immediately if any high-priority input exists
    return inputs.some(input => input.priority === "high");
  },
};
```

### How It Works: Generic Type Flow

```typescript
// 1. Define custom input type
interface MyCustomInput extends DefaultBatcherInput {
  customField: string;
}

// 2. Pass generic to Batcher
const batcher = new Batcher<MyCustomInput>(config, storage);
//                                ^^^^^^^^^^^^^

// 3. Generic flows through the entire system:
//    - batchInput() expects MyCustomInput
//    - Storage operations use MyCustomInput
//    - Adapter receives MyCustomInput[]
//    - Batching criteria functions get MyCustomInput[]
```

This design ensures **type safety** throughout the batching pipeline while maintaining **flexibility** for diverse blockchain requirements.

---

## How They Work Together

Here's a complete flow showing how all core concepts interact, including **extending `DefaultBatcherInput`** with custom fields:

```typescript
import { 
  createNewBatcher, 
  BatcherConfig,
  EffectstreamL2DefaultAdapter,
  FileStorage,
  DefaultBatcherInput,
  AddressType 
} from "@effectstream/batcher-sdk";

// 1. Define custom input type with additional fields
interface GameBatcherInput extends DefaultBatcherInput {
  priority: "low" | "medium" | "high";  // Custom field for prioritization
  gameSessionId?: string;                // Custom field for session tracking
}

// 2. Configure the Batcher with global settings
// Note: Adapters can be added dynamically before initialization
const config: BatcherConfig = {
  pollingIntervalMs: 1000,
  // No adapters in config - we'll add them dynamically
  port: 3334,
};

// 3. Create the Batcher instance with generic type parameter
// This ensures type safety throughout the system
const batcher = createNewBatcher<GameBatcherInput>(config, new FileStorage("./data"));
//                                ^^^^^^^^^^^^^^^^
//                                Generic type flows through entire batcher!

// 4. Create and add blockchain adapter dynamically
// This must be done BEFORE init() or runBatcher()
const ethereumAdapter = new EffectstreamL2DefaultAdapter(
  "0x1234...",  // EffectstreamL2 contract address
  "0xabcd...",  // Batcher private key
  0n,           // Transaction fee
  "eth-mainnet" // Sync protocol name (target can differ from this)
);

batcher.addBlockchainAdapter(
  "ethereum",  // Target name
  ethereumAdapter,
  {
    // Per-adapter batching criteria
    criteriaType: "custom",
    // Custom criteria can access the custom fields!
    isBatchReadyFn: (inputs: GameBatcherInput[]) => {
      // Process immediately if any high-priority input exists
      return inputs.some(inp => inp.priority === "high") || inputs.length >= 10;
    }
  }
);
// 🎯 "ethereum" is automatically set as defaultTarget (first adapter)

// 5. Add event listeners for observability
batcher.addStateTransition("startup", ({ publicConfig }) => {
  console.log(`Batcher ready. Default target: ${publicConfig.defaultTarget}`);
});

// 6. Initialize and run (adapters must be added before this!)
await batcher.init();

// 7. Submit inputs using your custom GameBatcherInput type
// TypeScript ensures all required fields are present (including custom ones!)
const input: GameBatcherInput = {
  addressType: AddressType.EVM,
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  input: "gameMove|x10y20",
  signature: "0x...",
  timestamp: Date.now().toString(),
  target: "ethereum",        // Routes to ethereumAdapter
  priority: "high",          // Custom field!
  gameSessionId: "session-123"  // Custom field!
};

const { requestId, receipt } = await batcher.batchInput(input, "wait-receipt");
//                                          ^^^^^^^^^^^^^^^^^^
//                                          Expects GameBatcherInput, not DefaultBatcherInput!

// batchInput resolves to { requestId, receipt, duplicate? } — never a bare
// receipt. `receipt` is null for `no-wait` and for a duplicate; `requestId` is
// always present and can be polled at GET /input-status/{requestId}.
console.log(`Request ${requestId} confirmed in block ${receipt?.blockNumber}`);
```

**Key Takeaways from this Example:**
1. **Generic Type Flows Through System**: `createNewBatcher<GameBatcherInput>()` makes the entire batcher type-aware
2. **Type Safety**: TypeScript enforces that all calls to `batchInput()` include custom fields
3. **Custom Criteria Access**: Batching criteria functions receive the extended type with custom fields
4. **Storage & Adapter Receive Extended Type**: The generic flows to storage operations and adapter methods
5. **Zero Runtime Overhead**: This is pure TypeScript-no runtime checks or transformations needed

---

## Summary

- **`Batcher`**: The orchestrator managing the entire batching lifecycle
- **`Target`**: String identifiers routing inputs to specific blockchains
- **`BatcherConfig`**: Global configuration defining batcher behavior
- **`BlockchainAdapter`**: Pluggable blockchain drivers implementing chain-specific logic
- **`DefaultBatcherInput`**: Extensible input structure supporting custom fields via generics

With these core concepts in place, you're ready to explore customization, advanced batching strategies, and multi-chain architectures in the following sections.

