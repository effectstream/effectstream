# Primitives

Primitives are the fundamental building blocks of EffectStream's data-ingestion layer. They act as specialized, chain-aware listeners that connect the **Sync Service** to your **State Machine**.

Each primitive is configured to monitor a specific on-chain address (like a smart contract) for a particular type of event or state change. When a matching event occurs, the primitive's job is to:

1.  **Parse** the raw on-chain data from the event.
2.  **Transform** it into a structured, type-safe JSON object.
3.  **Generate** an input that the EffectStream can schedule for execution by your State Machine.

This creates a deterministic and reliable pipeline from raw blockchain events to your dApp's business logic. EffectStream offers two types of primitives: built-in and custom.

## Built-in Primitives

EffectStream provides a suite of pre-built primitives for the most common blockchain standards, such as ERC20, ERC721, and the `EffectstreamL2Contract`. Using these is the quickest and easiest way to integrate standard on-chain assets and actions into your application.

### How to Use
You configure built-in primitives within your `localhostConfig.ts` file using the `.buildPrimitives()` step of the `ConfigBuilder`. You simply need to provide the primitive's type, the contract address to monitor, and the `stateMachinePrefix` that will trigger the corresponding State Transition Function (STF).

For example, here is how you would configure a primitive to track an `ERC721` NFT contract:

```ts
// In your localhostConfig.ts
import { PrimitiveTypeEVMERC721 } from "@effectstream/sm/builtin";

// ... inside new ConfigBuilder() ...
  .buildPrimitives(builder =>
    builder.addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "My_ERC721_NFT",
          type: PrimitiveTypeEVMERC721, // Use the built-in ERC721 primitive type
          startBlockHeight: 0,
          contractAddress: "0x...", // The address of your deployed ERC721 contract
          stateMachinePrefix: 'transfer-assets', // This will trigger the 'transfer-assets' STF
        })
    )
  )
```

A key advantage of built-in primitives is that many come with automatic database integration. For example, the `PrimitiveTypeEVMERC721` primitive creates a table in your database and keeps it up to date with the current owner of every token ID, which you can then easily query from your API. Learn more in the [Database section](./109-database.md).

A primitive that maintains a table for you **still triggers your state machine** — the two are independent. The table is created and populated whether or not you write a handler, and whenever you set a `stateMachinePrefix` the primitive also emits one input per on-chain event for the matching STF. Think of the table as the read model and the STF as where your app-specific logic goes; use either, or both. Pass `stateMachinePrefix: undefined` when you only want the table.

### Available Built-in Primitives

| Primitive Type | Chain | Description |
| :--- | :--- | :--- |
| **`PrimitiveTypeEVMEffectstreamL2`** | EVM | Listens for inputs submitted to a standard `EffectstreamL2Contract`. |
| **`PrimitiveTypeEVMERC20`** | EVM | Tracks `Transfer` events for an ERC20 token and maintains balance tables. |
| **`PrimitiveTypeEVMERC721`** | EVM | Tracks `Transfer` events for an ERC721 NFT and maintains ownership tables. |
| **`PrimitiveTypeEVMERC1155`**| EVM | Tracks `TransferSingle` and `TransferBatch` events for an ERC1155 token. |
| **`PrimitiveTypeMidnightGeneric`**| Midnight | Monitors the public `ledger` state of a Midnight ZK contract for changes. |
| **`PrimitiveTypeMidnightNullifierAndCommitment`** | Midnight | Emits each shielded coin nullifier (spend) and/or commitment (create) as they occur on chain; filter with `capture`. |
| **`PrimitiveTypeMidnightUnshieldedSpend`** | Midnight | Emits each unshielded UTXO spend as an `(owner, intentHash, outputIndex)` triple. |
| **`PrimitiveTypeMidnightUnshieldedCreate`** | Midnight | Emits each unshielded UTXO **created** on chain (regular **and** system transactions) — the existence counterpart of `UnshieldedSpend`. |
| **`PrimitiveTypeMidnightZswapRoot`** | Midnight | Emits the zswap coin-commitment Merkle tree **root** as it advances (the latest `zswapMerkleTreeRoot` per block). |
| **`PrimitiveTypeMidnightTokenMint`** | Midnight | Emits each custom token **mint** (shielded and unshielded) and maintains a registry table mapping a token id ("color") back to the contract that minted it. |
| **`PrimitiveTypeAvailGeneric`** | Avail | Listens for generic data blobs submitted to a specific application ID on the Avail DA layer. |
| **`PrimitiveTypeCardanoDelayedAsset`** | Cardano | Tracks creation and spending of native asset UTxOs with a real-time view of unspent holdings. |
| **`PrimitiveTypeCardanoMintBurn`** | Cardano | Captures native token mint and burn events with transaction metadata and participant addresses. |
| **`PrimitiveTypeCardanoPoolDelegation`** | Cardano | Tracks stake pool delegation changes with current delegation state per staking credential. |
| **`PrimitiveTypeCardanoProjectedNFT`** | Cardano | Tracks NFT lock-unlock-claim lifecycle at a Plutus script (hololocker) with time-lock metadata. |
| **`PrimitiveTypeCardanoTransfer`** | Cardano | Captures ADA and native asset transfers with full output details and input credentials. |
| **`PrimitiveTypeBitcoinAddress`** | Bitcoin | Watches a specific Bitcoin address for UTXO inputs and outputs. |
| **`PrimitiveTypeCelestiaGeneric`** | Celestia | Listens for data blobs in a specific Celestia namespace. |
| **`PrimitiveTypeNEARNEP141`** | NEAR | Tracks NEP-141 fungible token `ft_transfer` events and maintains balance tables. |
| **`PrimitiveTypeNEARNEP171`** | NEAR | Tracks NEP-171 NFT `nft_transfer` events and maintains ownership tables. |
| **`PrimitiveTypeNEARNEP245`** | NEAR | Tracks NEP-245 multi-token `mt_transfer` events and maintains balance tables. |
| **`PrimitiveTypeNEARIntent`** | NEAR | Monitors the NEAR Intents Verifier (`intents.near`) for DIP-4 `token_diff` settlement events. Supports filtering by token ID and account ID patterns. |
| **`PrimitiveTypeNEARGeneric`** | NEAR | Monitors any contract for arbitrary NEP-297 structured events. |
| **`PrimitiveTypeNEARAccountWatch`** | NEAR | Monitors all transactions targeting a specific NEAR account. |
| **`PrimitiveTypeSolanaProgramLog`** | Solana | Captures the log lines a watched program emitted, scoped by the `invoke`/`success` framing so only genuine invocations fire. |
| **`PrimitiveTypeSolanaAccountBalance`** | Solana | Tracks a watched address's lamport balance from each transaction's `postBalances`, resolving lookup-table addresses. |
| **`PrimitiveTypeSolanaTokenAccount`** | Solana | Tracks an SPL token balance from each transaction's `postTokenBalances`, filtered by mint, owner and/or token account. |

## Custom Primitives

For dApps that interact with unique, non-standard smart contracts or require custom data processing logic, you can create a **custom primitive**. The `multi-chain-token-transfer` template uses a custom primitive (`MCTErc1155Primitive`) to listen for its specific `TransferToMidnight` event.

### How it Works

A custom primitive is a class that extends the abstract `Primitive` class. It requires you to implement the logic for parsing the on-chain event and generating the appropriate payload for the state machine.

Here's a breakdown of the key parts of the `MCTErc1155Primitive` implementation:

#### 1. Define the Class and Properties

The class defines its unique type, the ABI of the event it's listening for, and the grammar of its output.

> NOTE: It is important that each sync protocol has different requirements for the primitive.  
> For example EVM requires the ABI and Event Signature.

```ts
// In packages/shared/custom-primitive-mct-erc1155/erc1155-primitive.ts
import { mct_erc1155 } from "@multi-chain-transfer/evm-contracts";
import { mctErc1155Grammar } from "./erc1155-grammar.ts";

const PrimitiveTypeEVMMCTERC1155 = "EVM:MCT_ERC1155" as const;

export class MCTErc1155Primitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof mctErc1155Grammar
> {
  readonly internalTypeName = PrimitiveTypeEVMMCTERC1155;
  readonly abi = getEvmEvent(mct_erc1155.abi, "TransferToMidnight(address,string,uint256,uint256,string)");
  override grammar = mctErc1155Grammar;
  readonly contractAddress: EvmAddress;

  constructor(config: { /* ... */ }) {
    super(config);
    this.contractAddress = Value.Decode(TypeboxHelpers.Evm.Address, config.contractAddress);
  }
  // ...
}
```

#### 2. Implement the `getPayload` Method

This method is the heart of the primitive. It receives the raw event data from the Sync Service and is responsible for transforming it into structured `accountingPayload` (for storage) and `stateMachinePayload` (for execution).

This function is expected to return two different payloads:
- `accountingPayload`: This is the payload that will be stored in the database, and might be used for further processing.
- `stateMachinePayload`: This is the payload that will be processed by the state machine, and only should be generated if a state-machine prefix is provided. 

```ts
// In packages/shared/custom-primitive-mct-erc1155/erc1155-primitive.ts
override *getPayload(
  _: EffectStreamBlockNumber,
  primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>,
): StateUpdateStream<{ /* ... */ }> {
  // 1. Destructure the raw event data
  const { from, midnight_address, amount, token_id, tx_hash } = primitiveTransactionData.output.payload;

  // 2. Parse and validate the data
  const fromAddr = Value.Decode(TypeboxHelpers.Evm.Address, from.toLowerCase());
  const amountParsed = Value.Decode(TypeboxHelpers.Uint256, amount);
  // ...

  // 3. Create the structured payload object
  const accountingPayload: ParamToData<typeof mctErc1155Grammar> = {
    midnight_address: midnight_address,
    from: fromAddr,
    amount: amountParsed,
    token_id: tokenIdParsed,
    tx_hash: tx_hash,
  };

  // 4. Generate the input for the State Machine, using the defined prefix
  const stateMachinePayload = this.stateMachinePrefix
    ? generateRawStmInput(this.grammar, this.stateMachinePrefix, accountingPayload)
    : null;

  // 5. Return the final structured data
  return {
    isBatched: false,
    data: [{
      accountingPayload,
      stateMachinePayload,
      // ... other metadata
    }],
  };
}
```

#### 3. Implement the `getConfig` Method

This method returns the configuration object that the Sync Service will use to monitor the blockchain for this primitive's specific event.

```ts
// In packages/shared/custom-primitive-mct-erc1155/erc1155-primitive.ts
override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.EVM_RPC_PARALLEL] {
  return {
    name: this.instanceName,
    type: this.internalTypeName,
    startBlockHeight: this.startBlockHeight,
    contractAddress: this.contractAddress,
    abi: this.abi,
    scheduledPrefix: this.stateMachinePrefix,
  } as const;
}
```

#### 4. Register the Custom Primitive

The final step is to register your custom primitive class in your `main.ts` file. This tells the EffectStream how to instantiate your primitive when it sees its `internalTypeName` in the configuration.

```ts
// In packages/client/node/src/main.ts
import { MCTErc1155Primitive } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-primitive";

main(function* () {
  // ...
  yield* withEffectStreamStaticConfig(localhostConfig, function* () {
    yield* start({
      // ...
      userDefinedPrimitives: {
        "EVM:MCT_ERC1155": MCTErc1155Primitive,
      },
    });
  });
  // ...
});
```