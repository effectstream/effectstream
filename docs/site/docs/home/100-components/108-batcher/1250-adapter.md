# Custom Adapters

## Overview

The `BlockchainAdapter` interface is the core extension point for supporting new blockchains in the Batcher. By implementing this interface, you can integrate any blockchain—whether EVM-based, zero-knowledge chains like Midnight, or custom Layer 2 solutions—into the unified batching pipeline.

This guide walks you through:
- Understanding the `BlockchainAdapter<TOutput>` interface
- Implementing each method with direct links to the pipeline
- Using optional helper classes for batch serialization
- Real-world examples (ERC1155 and Midnight adapters)

## Target Audience

Developers who need to:
- Support a new blockchain in the Batcher
- Customize batch submission logic for specialized contracts
- Implement chain-specific validation or signature schemes
- Override default batching behavior

## The `BlockchainAdapter<TOutput>` Interface

The adapter interface is generic over `TOutput`, which represents the **type of your serialized batch payload**. This flexibility allows each adapter to use the most appropriate data format for its blockchain.

```typescript
interface BlockchainAdapter<TOutput> {
  // Core batch operations
  buildBatchData(inputs, options?): BatchBuildingResult<TOutput> | null;
  submitBatch(data: TOutput, fee): Promise<BlockchainHash>;
  waitForTransactionReceipt(hash, timeout?): Promise<BlockchainTransactionReceipt>;
  estimateBatchFee(data: TOutput): Promise<string | bigint> | string | bigint;
  
  // Validation hooks (optional)
  verifySignature?(input): boolean | Promise<boolean>;
  validateInput?(input): ValidationResult | Promise<ValidationResult>;
  
  // State recovery (optional)
  recoverState?(pendingInputs): Promise<void> | void;
  
  // Metadata and state
  getAccountAddress(): string;
  getChainName(): string;
  getSyncProtocolName?(): string;
  isReady(): boolean;
  getBlockNumber(): Promise<bigint>;
  
  // Optional batch size constraint (in bytes)
  maxBatchSize?: number;
}
```

### Generic Type Parameter: `TOutput`

The `TOutput` parameter defines what `buildBatchData()` produces and what `submitBatch()` consumes:

| Blockchain Type | `TOutput` Example | Description |
|----------------|-------------------|-------------|
| **EVM (EffectstreamL2)** | `string` | JSON string like `["&B", [...]]` |
| **Midnight** | `MidnightBatchPayload` | Structured object with circuit args |
| **Custom Chain** | `Uint8Array` | Raw bytes for binary protocols |
| **Solana** | `Transaction` | Native transaction object |

**Key Insight**: The format is arbitrary. The only requirement is that your `submitBatch()` method knows how to parse what your `buildBatchData()` method creates.

---

## Implementing Adapter Methods

Each method in the interface maps to a specific step in the [batching pipeline](./1230-batching-pipeline.md). Let's walk through them in order.

### 1. `validateInput()` – Pre-Queue Validation (Optional)

**Pipeline Step:** [Step 3b: Input Validation](./1230-batching-pipeline.md#3b-input-validation)

**Purpose:** Validate inputs **before** they enter persistent storage. This prevents invalid data from polluting your queue.

**Signature:**
```typescript
validateInput?(input: DefaultBatcherInput): ValidationResult | Promise<ValidationResult>
```

**When to Implement:**
- Your chain requires specific input formats (e.g., circuit arguments for zero-knowledge chains)
- You need to validate payload structure before storage
- You want to fail fast on malformed inputs

**Example: ERC1155 Adapter**

The ERC1155 adapter validates function calls for `mint()` and `transferToMidnight()`:

```typescript
validateInput(input: DefaultBatcherInput): ValidationResult {
  try {
    // Parse the function call from input.input field
    const functionCall = this.parseFunctionCall(input.input);
    
    switch (functionCall.function) {
      case "mint":
        if (functionCall.args.length !== 2) {
          return {
            valid: false,
            error: `mint() expects 2 arguments (address, amount), got ${functionCall.args.length}`
          };
        }
        break;
        
      case "transferToMidnight":
        if (functionCall.args.length !== 3) {
          return {
            valid: false,
            error: `transferToMidnight() expects 3 arguments (amount, targetAddress, txHash), got ${functionCall.args.length}`
          };
        }
        break;
        
      default:
        return {
          valid: false,
          error: `Unsupported function: ${functionCall.function}. Supported: mint, transferToMidnight`
        };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown validation error"
    };
  }
}
```

**Example: Midnight Adapter**

The Midnight adapter validates circuit arguments:

```typescript
validateInput(input: DefaultBatcherInput): ValidationResult {
  try {
    // Decode input (might be hex-encoded)
    const decodedInput = this.decodeHexIfNeeded(input.input);
    
    // Parse circuit invocation
    const parsed = JSON.parse(decodedInput);
    
    if (!parsed || typeof parsed.circuit !== "string" || !Array.isArray(parsed.args)) {
      return {
        valid: false,
        error: "Invalid input structure. Expected { circuit: string, args: [] }"
      };
    }
    
    // Check circuit exists in contract
    const circuitDef = this.contractInfo.circuits.find(c => c.name === parsed.circuit);
    if (!circuitDef) {
      return {
        valid: false,
        error: `Circuit "${parsed.circuit}" not found. Available: ${
          this.contractInfo.circuits.map(c => c.name).join(", ")
        }`
      };
    }
    
    // Validate circuit arguments structure
    parseCircuitArgs(parsed.circuit, parsed.args, this.contractInfo);
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown validation error"
    };
  }
}
```

:::tip When to Skip Validation
If your blockchain accepts any input format and validation happens on-chain, you can omit this method. The batcher will accept all inputs that pass signature verification.
:::

---

### 2. `verifySignature()` – Authentication (Optional)

**Pipeline Step:** [Step 3a: Signature Verification](./1230-batching-pipeline.md#3a-signature-verification)

**Purpose:** Verify cryptographic signatures to ensure inputs are authentic.

**Signature:**
```typescript
verifySignature?(input: DefaultBatcherInput): boolean | Promise<boolean>
```

**Default Behavior:** If not implemented, the batcher uses EVM signature verification via `CryptoManager.Evm().verifySignature()`.

**When to Override:**
- Your blockchain doesn't use traditional signatures (e.g., Midnight uses circuit-based proofs)
- You need custom signature schemes (e.g., multi-sig, threshold signatures)
- Signatures are verified on-chain and you want to skip client-side verification

**Example: Midnight Adapter (Bypass Signatures)**

Midnight uses zero-knowledge circuits instead of traditional signatures:

```typescript
verifySignature(input: DefaultBatcherInput): boolean {
  // Midnight inputs use circuit-based validation, not signatures
  // The adapter/contract is responsible for authentication
  return true;  // Bypass signature check
}
```

**Example: Custom Multi-Sig Adapter**

```typescript
async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
  // Expect signature to contain multiple signatures
  const signatures = JSON.parse(input.signature);
  
  if (!Array.isArray(signatures) || signatures.length < this.requiredSignatures) {
    return false;
  }
  
  // Verify each signature
  for (const sig of signatures) {
    const isValid = await this.cryptoManager.verifySignature(
      input.address,
      input.input,
      sig,
      input.timestamp
    );
    if (!isValid) return false;
  }
  
  return true;
}
```

:::warning Signature Verification is Critical
If you return `true` unconditionally, **any input will pass authentication**. Only do this if your blockchain has alternative authentication mechanisms (like circuit proofs) or if signature verification happens on-chain.
:::

---

### 3. `buildBatchData()` – Serialization

**Pipeline Step:** [Step 6: Building](./1230-batching-pipeline.md#step-6-building-adapter-driven)

**Purpose:** Transform an array of `DefaultBatcherInput` into a single `TOutput` payload that your blockchain can consume.

**Signature:**
```typescript
buildBatchData(
  inputs: DefaultBatcherInput[],
  options?: BatchBuildingOptions
): BatchBuildingResult<TOutput> | null
```

**Return Type:**
```typescript
interface BatchBuildingResult<TOutput> {
  selectedInputs: DefaultBatcherInput[];  // Inputs included in this batch
  data: TOutput;                           // Serialized batch payload
}
```

**Key Responsibilities:**
1. **Serialize** inputs into your blockchain's expected format
2. **Respect size limits** via `options.maxSize` or `this.maxBatchSize`
3. **Select inputs** that fit within the size constraint
4. **Return remaining inputs** (they'll be processed in the next batch)

**Two Approaches:**

#### Approach A: Use a Helper Class (Recommended for Standard Formats)

If your blockchain uses a standard format (like EffectStream's JSON batching format), use a helper class:

**Example: EffectstreamL2DefaultAdapter (EVM)**

```typescript
export class EffectstreamL2DefaultAdapter implements BlockchainAdapter<string> {
  private readonly batchBuilderLogic = new DefaultBatchBuilderLogic();
  
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<string> | null {
    // Delegate to helper that produces: ["&B", [input1, input2, ...]]
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
}
```

The `DefaultBatchBuilderLogic` produces:
```json
["&B", [
  ["0", "0x742d35Cc...", "0xsig1...", "move|x10y20", "1234567890"],
  ["0", "0xabc123...", "0xsig2...", "attack|id5", "1234567891"]
]]
```

**Example: MidnightAdapter**

```typescript
export class MidnightAdapter implements BlockchainAdapter<MidnightBatchPayload | null> {
  private readonly batchBuilderLogic = new MidnightBatchBuilderLogic();
  
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<MidnightBatchPayload | null> | null {
    // Delegate to helper that produces structured circuit args
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
}
```

The `MidnightBatchBuilderLogic` produces:
```typescript
{
  prefix: "&B",
  payloads: [
    {
      circuit: "transferBatch",
      args: [100n, "0xabc..."],
      addressType: 0,
      address: "0x742d35Cc...",
      signature: "...",
      timestamp: "1234567890"
    }
  ]
}
```

#### Approach B: Implement Custom Logic

For unique blockchain requirements, implement serialization directly:

**Example: Binary Protocol Adapter**

```typescript
export class BinaryProtocolAdapter implements BlockchainAdapter<Uint8Array> {
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<Uint8Array> | null {
    if (inputs.length === 0) return null;
    
    const maxSize = options?.maxSize ?? this.maxBatchSize ?? 10000;
    const selectedInputs: DefaultBatcherInput[] = [];
    const chunks: Uint8Array[] = [];
    
    let currentSize = 4; // 4-byte header for input count
    
    for (const input of inputs) {
      // Serialize each input to binary format
      const serialized = this.serializeInput(input);
      
      if (currentSize + serialized.length > maxSize) {
        break; // Size limit reached
      }
      
      chunks.push(serialized);
      selectedInputs.push(input);
      currentSize += serialized.length;
    }
    
    if (chunks.length === 0) return null;
    
    // Combine all chunks into a single Uint8Array with header
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, chunks.length, false);
    
    const data = new Uint8Array(currentSize);
    data.set(header, 0);
    
    let offset = 4;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    
    return { selectedInputs, data };
  }
  
  private serializeInput(input: DefaultBatcherInput): Uint8Array {
    // Custom binary serialization logic
    // ...
  }
}
```

:::tip Size Management
Always respect `options?.maxSize` or `this.maxBatchSize`. If an input doesn't fit, **don't include it**—it will be processed in the next batch automatically.
:::

---

### 4. `submitBatch()` – Execution

**Pipeline Step:** [Step 7: Submission](./1230-batching-pipeline.md#step-7-submission-adapter-driven)

**Purpose:** Submit the batch payload to your blockchain and return the transaction hash.

**Signature:**
```typescript
submitBatch(data: TOutput, fee: string | bigint): Promise<BlockchainHash>
```

**Key Responsibilities:**
1. **Parse** the `data` produced by `buildBatchData()`. Some implementations just might want to send the received batched data withot parsing it.
2. **Construct** a blockchain transaction
3. **Sign and submit** the transaction
4. **Return** the transaction hash

**Example: EffectstreamL2DefaultAdapter (EVM)**

```typescript
async submitBatch(data: string, fee?: string | bigint): Promise<BlockchainHash> {
  let actualFee = this.effectstreamL2Fee;
  if (fee) {
    actualFee = typeof fee === "string" ? BigInt(fee) : fee;
  }
  
  // Convert JSON string to hex bytes
  const hexData = encodeHexFromString(data);
  
  // Submit to EffectstreamL2 contract
  const hash = await this.walletClient.writeContract({
    account: this.account,
    chain: this.walletClient.chain,
    address: this.effectstreamL2Address,
    abi: this.effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [hexData],
    value: actualFee,
  });
  
  console.log(`🚀 Submitted batch transaction: ${hash}`);
  return hash;
}
```

**Example: MidnightAdapter**

```typescript
async submitBatch(
  data: MidnightBatchPayload | null,
  fee?: string | bigint
): Promise<BlockchainHash> {
  if (!data || !data.payloads || data.payloads.length === 0) {
    throw new Error("Batch payload contained no invocations");
  }
  
  // Midnight uses circuit invocations instead of raw transactions
  const { circuit, args } = data.payloads[0];
  
  console.log(`🔄 Invoking circuit "${circuit}" with ${args.length} arguments`);
  
  // Parse circuit arguments
  const parsedArgs = parseCircuitArgs(circuit, args, this.contractInfo);
  
  // Invoke the circuit via deployed contract
  const result = await this.deployedContract.callTx[circuit](...parsedArgs);
  
  // Extract transaction hash from result
  if (result && result.public && result.public.txHash) {
    const txHash = result.public.txHash;
    console.log(`🚀 Circuit invoked successfully! Transaction Hash: ${txHash}`);
    return txHash;
  }
  
  throw new Error("Transaction result format unexpected");
}
```

**Example: ERC1155CustomAdapter**

```typescript
async submitBatch(data: string, fee?: string | bigint): Promise<BlockchainHash> {
  // Parse the default batch format: ["&B", [input1, input2, ...]]
  const batchArray = this.parseDefaultBatchFormat(data);
  
  if (batchArray.inputs.length === 0) {
    throw new Error("Batch payload contained no inputs");
  }
  
  // Extract first input: [addressType, address, signature, input, timestamp]
  const firstInput = JSON.parse(batchArray.inputs[0] as string);
  const inputData = firstInput[3]; // The 'input' field
  
  // Parse function call: { "function": "mint", "args": [...] }
  const functionCall = this.parseFunctionCall(inputData);
  
  let hash: string;
  
  // Route to appropriate contract function
  switch (functionCall.function) {
    case "mint": {
      const [to, amount] = functionCall.args;
      hash = await this.walletClient.writeContract({
        account: this.account,
        address: this.erc1155Address,
        abi: mct_erc1155.abi,
        functionName: "mint",
        args: [to as `0x${string}`, BigInt(amount)],
      });
      break;
    }
    
    case "transferToMidnight": {
      const [amount, targetAddress, txHash] = functionCall.args;
      hash = await this.walletClient.writeContract({
        account: this.account,
        address: this.erc1155Address,
        abi: mct_erc1155.abi,
        functionName: "transferToMidnight",
        args: [BigInt(amount), targetAddress as `0x${string}`, txHash as `0x${string}`],
      });
      break;
    }
    
    default:
      throw new Error(`Unsupported function: ${functionCall.function}`);
  }
  
  console.log(`🚀 Submitted transaction: ${hash}`);
  return hash;
}
```

:::tip Contract ABI Integration
For EVM adapters, import your contract's ABI from `@effectstream/evm-contracts` or your project's contract package. This provides type-safe contract interactions via viem.
:::

---

### 5. `waitForTransactionReceipt()` – Confirmation

**Pipeline Step:** [Step 8: Confirmation](./1230-batching-pipeline.md#step-8-confirmation-adapter-driven)

**Purpose:** Wait for the blockchain to confirm the transaction and return a receipt.

**Signature:**
```typescript
waitForTransactionReceipt(
  hash: BlockchainHash,
  timeout?: number
): Promise<BlockchainTransactionReceipt>
```

**Return Type:**
```typescript
interface BlockchainTransactionReceipt {
  hash: BlockchainHash;
  blockNumber: bigint;
  status: number;  // 1 = success, 0 = failure
  [key: string]: any;  // Additional chain-specific fields
}
```

**Example: EVM Adapter**

```typescript
async waitForTransactionReceipt(
  hash: BlockchainHash,
  timeout?: number
): Promise<BlockchainTransactionReceipt> {
  const receipt = await this.publicClient.waitForTransactionReceipt({
    hash: hash as Hash,
    timeout,
  });
  
  console.log(
    `✅ Transaction confirmed! Block: ${receipt.blockNumber}, Hash: ${hash}, Status: ${receipt.status}`
  );
  
  return {
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status === "success" ? 1 : 0,
    _viemReceipt: receipt,  // Include original for EVM-specific access
  };
}
```

**Example: Midnight Adapter**

```typescript
async waitForTransactionReceipt(
  hash: BlockchainHash,
  timeout: number = 60000
): Promise<BlockchainTransactionReceipt> {
  console.log(`⏳ Waiting for transaction confirmation: ${hash}`);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const txInfo = await this.queryTransactionStatus(hash);
      
      if (txInfo && txInfo.confirmed) {
        console.log(
          `✅ Transaction confirmed! Block: ${txInfo.blockNumber}, Hash: ${hash}`
        );
        
        return {
          hash,
          blockNumber: txInfo.blockNumber,
          status: 1, // Success
          _midnightTxInfo: txInfo,
        };
      }
    } catch (error) {
      console.warn(`Failed to query transaction status: ${error}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
}

private async queryTransactionStatus(
  txId: string
): Promise<{ confirmed: boolean; blockNumber: bigint } | null> {
  // Query indexer GraphQL API for transaction status
  const query = `query ($hash: String!) {
    transactions(offset: { hash: $hash }) {
      applyStage
      block { height }
    }
  }`;
  
  const response = await this.gqlQuery(query, { hash: txId });
  
  if (!response?.transactions?.[0]) return null;
  
  const tx = response.transactions[0];
  const confirmed = tx.applyStage === "SucceedEntirely";
  
  return {
    confirmed,
    blockNumber: BigInt(tx.block.height),
  };
}
```

:::tip Timeout Handling
Always implement timeout logic. If a transaction is lost or the blockchain is stalled, you don't want the batcher to hang indefinitely.
:::

---

### 6. `estimateBatchFee()` – Fee Estimation

**Pipeline Step:** [Step 7: Submission](./1230-batching-pipeline.md#step-7-submission-adapter-driven) (called before `submitBatch`)

**Purpose:** Estimate the transaction fee for submitting a batch.

**Signature:**
```typescript
estimateBatchFee(data: TOutput): Promise<string | bigint> | string | bigint
```

**Common Approaches:**

#### Approach A: Static Fee (Simplest)

```typescript
estimateBatchFee(data: string): bigint {
  return this.configuredFee;  // Return pre-configured fee
}
```

#### Approach B: Gas Estimation (EVM)

```typescript
async estimateBatchFee(data: string): Promise<bigint> {
  const hexData = encodeHexFromString(data);
  
  const gasEstimate = await this.publicClient.estimateContractGas({
    address: this.contractAddress,
    abi: this.contractAbi,
    functionName: "effectstreamSubmitGameInput",
    args: [hexData],
    account: this.account,
  });
  
  const gasPrice = await this.publicClient.getGasPrice();
  return gasEstimate * gasPrice;
}
```

#### Approach C: Zero Fee (Chain-Specific)

```typescript
estimateBatchFee(data: MidnightBatchPayload | null): bigint {
  // Midnight uses native token for fees, handled by wallet
  return 0n;
}
```

---

### 7. Metadata Methods

These methods provide information about the adapter's state and configuration.

#### `getAccountAddress()`

Return the address that will submit transactions:

```typescript
getAccountAddress(): string {
  return this.account.address;  // EVM example
}
```

#### `getChainName()`

Return a human-readable chain identifier:

```typescript
getChainName(): string {
  return this.walletClient.chain?.name || "Unknown EVM Chain";
}
```

#### `getSyncProtocolName()` (Optional)

Return the EffectStream Sync protocol name for event filtering and `wait-effectstream-processed` queries:

```typescript
getSyncProtocolName(): string {
  return this.effectstreamSyncProtocolName;  // e.g., "mainEvmRPC"
}
```

If not implemented, the batcher falls back to `getChainName()`.

#### `isReady()`

Check if the adapter is initialized and ready to submit transactions:

```typescript
isReady(): boolean {
  return this.walletClient !== undefined && this.publicClient !== undefined;
}
```

#### `getBlockNumber()`

Get the latest block number:

```typescript
async getBlockNumber(): Promise<bigint> {
  return await this.publicClient.getBlockNumber();
}
```

---

### 8. `recoverState()` – Crash Recovery (Optional)

**Pipeline Step:** Initialization (called after `storage.init()` but before polling starts)

**Purpose:** Rebuild adapter internal state from persisted inputs after a batcher crash or restart. This is essential for stateful adapters that track information like reserved funds, pending operations, or caches.

**Signature:**
```typescript
recoverState?(pendingInputs: DefaultBatcherInput[]): Promise<void> | void
```

**When to Implement:**
- Your adapter maintains internal state based on queued inputs
- You need to track reserved resources (e.g., Bitcoin reserved funds)
- You cache information that must be rebuilt after restart
- Your adapter performs pre-validation that affects later operations

**Example: BitcoinAdapter (Fund Reservation Recovery)**

The Bitcoin adapter tracks `reservedSatFunds` to prevent over-committing during validation. After a crash, this in-memory counter must be rebuilt from storage:

```typescript
async recoverState(pendingInputs: DefaultBatcherInput[]): Promise<void> {
  // Rebuild reserved funds from pending inputs in storage
  this.reservedSatFunds = 0;
  
  for (const input of pendingInputs) {
    try {
      const payload: BitcoinRequest = JSON.parse(input.input);
      this.reservedSatFunds += payload.amountSats;
    } catch (e) {
      console.warn(`BitcoinAdapter: Failed to parse input during state recovery:`, e);
    }
  }
  
  console.log(
    `BitcoinAdapter: Recovered state - ${this.reservedSatFunds} sats reserved ` +
    `across ${pendingInputs.length} pending inputs`
  );
}

async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
  const payload: BitcoinRequest = JSON.parse(input.input);
  
  // Check if batcher has sufficient funds
  const balance = await this.getBatcherBalance();
  const availableFunds = balance - this.reservedSatFunds;  // Uses recovered state
  
  if (availableFunds < payload.amountSats + estimatedFee) {
    return {
      valid: false,
      error: `Insufficient batcher funds. Available: ${availableFunds} sats`
    };
  }
  
  // Reserve funds for this transaction
  this.reservedSatFunds += payload.amountSats;
  return { valid: true };
}

async submitBatch(data: BitcoinBatchPayload, fee: string | bigint): Promise<BlockchainHash> {
  // ... build and sign transaction ...
  
  const txId = await this.rpcCall("sendrawtransaction", [txHex]);
  
  // Liberate reserved funds after successful submission
  this.reservedSatFunds -= data.totalAmountSats;
  
  return txId;
}
```

**Example: Custom Caching Adapter**

```typescript
async recoverState(pendingInputs: DefaultBatcherInput[]): Promise<void> {
  // Rebuild user action cache
  this.userActionCache.clear();
  
  for (const input of pendingInputs) {
    const userId = this.extractUserId(input);
    if (!this.userActionCache.has(userId)) {
      this.userActionCache.set(userId, []);
    }
    this.userActionCache.get(userId)!.push(input);
  }
  
  console.log(
    `Recovered cache for ${this.userActionCache.size} users with ` +
    `${pendingInputs.length} pending actions`
  );
}
```

**Lifecycle Integration:**

The batcher calls `recoverState()` during initialization for each registered adapter:

```typescript
// In batcher.init() or runBatcher()
await storage.init();

// Recover state for each adapter
for (const [target, adapter] of Object.entries(this.adapters)) {
  if (typeof adapter.recoverState === "function") {
    const pendingInputs = await storage.getInputsByTarget(target, defaultTarget);
    await adapter.recoverState(pendingInputs);
  }
}

// Now start polling and processing batches
```

:::tip When to Skip Recovery
If your adapter is stateless (e.g., it only needs configuration and doesn't track anything based on inputs), you don't need to implement `recoverState()`. Most simple adapters fall into this category.
:::

:::warning Memory Leak Prevention
Without `recoverState()`, stateful adapters can experience memory leaks after crashes:

**Without Recovery:**
```
1. Input A validated → reservedFunds = 5000 → stored to disk
2. Input B validated → reservedFunds = 10000 → stored to disk
3. 💥 CRASH
4. Restart → reservedFunds = 0 (reset!) ❌
5. Input C validation sees wrong available balance
```

**With Recovery:**
```
1. Input A validated → reservedFunds = 5000 → stored to disk
2. Input B validated → reservedFunds = 10000 → stored to disk  
3. 💥 CRASH
4. Restart → storage.init()
5. recoverState([A, B]) → reservedFunds = 10000 ✅
6. Input C validation sees correct available balance
```
:::

---

## Helper Classes for Batch Serialization

The batcher provides two helper classes for common serialization patterns. These are **optional**—you can always implement custom logic in `buildBatchData()`.

### `DefaultBatchBuilderLogic`

**Purpose:** Create the standard EffectStream JSON batch format used by the EffectstreamL2 contract.

**Output Format:**
```json
["&B", [
  [addressType, address, signature, input, timestamp],
  [addressType, address, signature, input, timestamp],
  ...
]]
```

**Usage:**
```typescript
import { DefaultBatchBuilderLogic } from "@effectstream/batcher-sdk";

export class MyEVMAdapter implements BlockchainAdapter<string> {
  private readonly batchBuilderLogic = new DefaultBatchBuilderLogic();
  
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<string> | null {
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
}
```

**Implementation Details:**

The helper:
1. Starts with `maxSize - ["&B", []].length` bytes remaining
2. For each input:
   - Serializes it as `[addressType, address, signature, input, timestamp]`
   - Checks if it fits in remaining space
   - If yes, adds it to the batch; if no, stops
3. Returns `{ selectedInputs, data: JSON.stringify(batch) }`

**Source:** `packages/batcher/batch-data-builder/default-builder-logic.ts`

### `MidnightBatchBuilderLogic`

**Purpose:** Create structured circuit invocation payloads for Midnight contracts.

**Output Format:**
```typescript
{
  prefix: "&B",
  payloads: [
    {
      circuit: "transferBatch",
      args: [100n, "0xabc..."],
      addressType: 0,
      address: "0x742d35Cc...",
      signature: "...",
      timestamp: "1234567890"
    }
  ]
}
```

**Usage:**
```typescript
import { MidnightBatchBuilderLogic, type MidnightBatchPayload } from "@effectstream/batcher-sdk";

export class MyMidnightAdapter implements BlockchainAdapter<MidnightBatchPayload | null> {
  private readonly batchBuilderLogic = new MidnightBatchBuilderLogic();
  
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<MidnightBatchPayload | null> | null {
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
}
```

**Implementation Details:**

The helper:
1. Decodes each `input.input` field (may be hex-encoded)
2. Parses it as JSON: `{ circuit: string, args: any[] }`
3. Builds a structured payload with circuit invocation metadata
4. Respects `maxSize` by estimating JSON-serialized size

**Source:** `packages/batcher/batch-data-builder/midnight-builder-logic.ts`

---

## Complete Adapter Examples

### Example 1: ERC1155CustomAdapter (Using Helper)

This adapter uses `DefaultBatchBuilderLogic` for serialization but implements custom submission logic to route inputs to different ERC1155 contract functions.

**Key Features:**
- ✅ Uses `DefaultBatchBuilderLogic` for batch serialization
- ✅ Parses JSON function calls from inputs (`{"function": "mint", "args": [...]}`)
- ✅ Routes to different contract functions (`mint()`, `transferToMidnight()`)
- ✅ Pre-validates function names and argument counts

```typescript
import { DefaultBatchBuilderLogic } from "@effectstream/batcher-sdk";
import type { BlockchainAdapter, DefaultBatcherInput } from "@effectstream/batcher-sdk";

export class ERC1155CustomAdapter implements BlockchainAdapter<string | null> {
  private readonly batchBuilderLogic = new DefaultBatchBuilderLogic();
  
  // Use helper for batch building
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: { maxSize?: number }
  ): { selectedInputs: DefaultBatcherInput[]; data: string } | null {
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
  
  // Custom validation for function calls
  validateInput(input: DefaultBatcherInput) {
    try {
      const functionCall = this.parseFunctionCall(input.input);
      
      switch (functionCall.function) {
        case "mint":
          if (functionCall.args.length !== 2) {
            return {
              valid: false,
              error: `mint() expects 2 arguments, got ${functionCall.args.length}`
            };
          }
          break;
          
        case "transferToMidnight":
          if (functionCall.args.length !== 3) {
            return {
              valid: false,
              error: `transferToMidnight() expects 3 arguments, got ${functionCall.args.length}`
            };
          }
          break;
          
        default:
          return {
            valid: false,
            error: `Unsupported function: ${functionCall.function}`
          };
      }
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown validation error"
      };
    }
  }
  
  // Custom submission logic
  async submitBatch(data: string, fee?: string | bigint) {
    // Parse default batch format: ["&B", [input1, input2, ...]]
    const batchArray = this.parseDefaultBatchFormat(data);
    
    // Extract first input
    const firstInput = JSON.parse(batchArray.inputs[0] as string);
    const inputData = firstInput[3]; // The 'input' field
    
    // Parse function call
    const functionCall = this.parseFunctionCall(inputData);
    
    // Route to appropriate function
    let hash: string;
    switch (functionCall.function) {
      case "mint": {
        const [to, amount] = functionCall.args;
        hash = await this.walletClient.writeContract({
          account: this.account,
          address: this.erc1155Address,
          abi: mct_erc1155.abi,
          functionName: "mint",
          args: [to as `0x${string}`, BigInt(amount)],
        });
        break;
      }
      
      case "transferToMidnight": {
        const [amount, targetAddress, txHash] = functionCall.args;
        hash = await this.walletClient.writeContract({
          account: this.account,
          address: this.erc1155Address,
          abi: mct_erc1155.abi,
          functionName: "transferToMidnight",
          args: [BigInt(amount), targetAddress as `0x${string}`, txHash as `0x${string}`],
        });
        break;
      }
      
      default:
        throw new Error(`Unsupported function: ${functionCall.function}`);
    }
    
    console.log(`🚀 Submitted transaction: ${hash}`);
    return hash;
  }
  
  // ... other required methods (waitForTransactionReceipt, etc.)
}
```

**Full Source:** `templates/multi-chain-token-transfer/packages/client/batcher/erc1155-adapter.ts`

---

### Example 2: MidnightAdapter (Using Helper)

This adapter uses `MidnightBatchBuilderLogic` for serialization and implements circuit invocation logic for the Midnight blockchain.

**Key Features:**
- ✅ Uses `MidnightBatchBuilderLogic` for batch serialization
- ✅ Validates circuit arguments against contract schema
- ✅ Bypasses signature verification (uses `return true`)
- ✅ Invokes circuits via `deployedContract.callTx[circuit](...args)`
- ✅ Queries Midnight indexer GraphQL API for transaction confirmation

```typescript
import { MidnightBatchBuilderLogic, type MidnightBatchPayload } from "@effectstream/batcher-sdk";
import type { BlockchainAdapter, DefaultBatcherInput } from "@effectstream/batcher-sdk";

export class MidnightAdapter implements BlockchainAdapter<MidnightBatchPayload | null> {
  private readonly batchBuilderLogic = new MidnightBatchBuilderLogic();
  
  // Bypass signature verification (Midnight uses circuit proofs)
  verifySignature(input: DefaultBatcherInput): boolean {
    return true;
  }
  
  // Validate circuit arguments
  validateInput(input: DefaultBatcherInput) {
    try {
      const decodedInput = this.decodeHexIfNeeded(input.input);
      const parsed = JSON.parse(decodedInput);
      
      if (!parsed || typeof parsed.circuit !== "string" || !Array.isArray(parsed.args)) {
        return {
          valid: false,
          error: "Invalid input structure. Expected { circuit: string, args: [] }"
        };
      }
      
      // Check circuit exists
      const circuitDef = this.contractInfo.circuits.find(c => c.name === parsed.circuit);
      if (!circuitDef) {
        return {
          valid: false,
          error: `Circuit "${parsed.circuit}" not found`
        };
      }
      
      // Validate arguments
      parseCircuitArgs(parsed.circuit, parsed.args, this.contractInfo);
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown validation error"
      };
    }
  }
  
  // Use helper for batch building
  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<MidnightBatchPayload | null> | null {
    return this.batchBuilderLogic.buildBatchData(inputs, options);
  }
  
  // Submit via circuit invocation
  async submitBatch(
    data: MidnightBatchPayload | null,
    fee?: string | bigint
  ): Promise<BlockchainHash> {
    if (!data || !data.payloads || data.payloads.length === 0) {
      throw new Error("Batch payload contained no invocations");
    }
    
    const { circuit, args } = data.payloads[0];
    
    // Check if circuit is pure (query) or impure (transaction)
    const circuitDef = this.contractInfo.circuits.find(c => c.name === circuit);
    if (!circuitDef) {
      throw new Error(`Circuit "${circuit}" not found`);
    }
    
    const parsedArgs = parseCircuitArgs(circuit, args, this.contractInfo);
    
    if (circuitDef.pure) {
      // Pure circuit - local query, return fake hash
      const result = await this.deployedContract.call[circuit](...parsedArgs);
      return `query:${circuit}:${JSON.stringify(result)}`;
    } else {
      // Impure circuit - submit transaction
      const result = await this.deployedContract.callTx[circuit](...parsedArgs);
      
      if (result?.public?.txHash) {
        console.log(`🚀 Circuit invoked! Transaction Hash: ${result.public.txHash}`);
        return result.public.txHash;
      }
      
      throw new Error("Transaction result format unexpected");
    }
  }
  
  // Query Midnight indexer for confirmation
  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000
  ): Promise<BlockchainTransactionReceipt> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const txInfo = await this.queryTransactionStatus(hash);
      
      if (txInfo?.confirmed) {
        return {
          hash,
          blockNumber: txInfo.blockNumber,
          status: 1,
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
  }
  
  private async queryTransactionStatus(txId: string) {
    const query = `query ($hash: String!) {
      transactions(offset: { hash: $hash }) {
        applyStage
        block { height }
      }
    }`;
    
    const response = await this.gqlQuery(query, { hash: txId });
    
    if (!response?.transactions?.[0]) return null;
    
    const tx = response.transactions[0];
    return {
      confirmed: tx.applyStage === "SucceedEntirely",
      blockNumber: BigInt(tx.block.height),
    };
  }
}
```

**Full Source:** `packages/batcher/adapters/midnight-adapter.ts`

---

## Key Takeaways

1. **Format Flexibility**: `TOutput` can be any type—string, object, binary. The only requirement is that `submitBatch()` can parse what `buildBatchData()` produces.

2. **Helper Classes are Optional**: Use `DefaultBatchBuilderLogic` or `MidnightBatchBuilderLogic` for standard formats, or implement custom serialization for unique requirements.

3. **Validation Happens Pre-Queue**: Implement `validateInput()` to reject bad inputs **before** they hit storage. This prevents queue pollution.

4. **Signature Verification is Overridable**: Return `true` from `verifySignature()` to bypass authentication if your chain uses alternative mechanisms (like circuit proofs).

5. **Each Method Maps to a Pipeline Step**: Understanding the [batching pipeline](./1230-batching-pipeline.md) helps you implement adapters correctly.

6. **Type Safety Flows Through**: The generic `TOutput` parameter ensures type safety from `buildBatchData()` → `estimateBatchFee()` → `submitBatch()`.

## Next Steps

- Review [The Batching Pipeline](./1230-batching-pipeline.md) to understand the complete flow
- Explore [Configuration](./1240-configuration.md) to learn how to wire adapters into the batcher
- Check [Core Concepts](./1220-core-concepts.md) for deeper understanding of batcher architecture
- Study the full adapter implementations:
  - `packages/batcher/adapters/effectstream-l2-adapter.ts` (EVM reference)
  - `packages/batcher/adapters/midnight-adapter.ts` (Midnight reference)
  - `templates/multi-chain-token-transfer/packages/client/batcher/erc1155-adapter.ts` (Custom EVM example)
