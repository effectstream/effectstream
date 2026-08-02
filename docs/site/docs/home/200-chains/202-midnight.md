# Midnight

Midnight is a privacy-focused ZK (Zero-Knowledge) blockchain. EffectStream integrates with Midnight to read public state changes resulting from private circuit execution.

Some key points about Midnight:
*   **Private State**: Keep user data and application logic confidential.
*   **Confidential Transactions**: Execute transactions without revealing their details on-chain.
*   **Verifiable Computation**: Run complex logic off-chain and prove its correct execution on-chain without revealing the inputs.

### How Midnight Works: An Overview

Midnight allows to keep the user's private and public data in the blockchain. The key components are, for understanding how it works:

*   **User & Wallet**: Interacts with the dApp. The wallet manages keys and signs transactions, but sensitive data never leaves the user's device.
*   **Proof Server**: A (local or remote) service that generates the ZK proofs required for transactions.
*   **Node**: The core blockchain client that validates transactions by verifying their ZK proofs and maintains the public ledger.
*   **Indexer**: A service that tracks the public blockchain data, making it easily queryable for dApps.
*   **Smart Contracts (Compact)**: Contracts are written in Compact, a language designed for ZK. They define private logic (circuits) and can expose a **public `ledger` state**.
*  **ledger**: The public state of the contract. It is the state that is exposed to the EffectStream.

### EffectStream & Midnight Integration

EffectStream acts as a powerful deterministic off-chain indexer and state machine that **monitors the public state** of Midnight contracts. It does not handle private data or proof generation. Instead, it observes the *results* of private computations that are made public on the Midnight ledger.

This allows you to build complex dApps that combine the privacy of Midnight with the multi-chain data aggregation and deterministic logic of EffectStream.

```mermaid
graph TD
    subgraph EffectStream
        EffectStreamSync[Sync Service] --> EffectStreamSM[State Machine]
    end

    subgraph User's Machine
        A[User/Frontend] --> B{Wallet};
        B --> C[Proof Server];
    end

    subgraph Midnight Network
        D[Midnight Node] --> E[Indexer];
    end

    C -- ZK Proof --> B;
    B -- Signed TX with Proof --> D;
    E -- Fetches Public State --> EffectStreamSync;

   
```

## 1. Configuration (Read)

### Network Definition
Define the connection to the Midnight node.

```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "midnight",
    type: ConfigNetworkType.MIDNIGHT,
    genesisHash: "0x...",
    networkId: 0, // 0 for local undeployed/devnet
    nodeUrl: "http://127.0.0.1:9944",
  })
)
```

### Sync Protocol
The protocol type `MIDNIGHT_PARALLEL` connects to the Midnight Indexer (GraphQL) to fetch state updates.

```ts
.addParallel(
  (networks) => networks.midnight,
  (network, deployments) => ({
    name: "parallelMidnight",
    type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    startBlockHeight: 1,
    pollingInterval: 1000,
    indexer: "http://127.0.0.1:8088/api/v1/graphql",
    indexerWs: "ws://127.0.0.1:8088/api/v1/graphql/ws",
  })
)
```

### Contract Development

*   **Language**: Compact (a TypeScript-inspired DSL for ZK).
*   **Compilation**: `bun run --cwd packages/contracts-midnight build`

A Midnight contract defines private state transitions (`circuits`) and can choose to expose certain data publicly in its `ledger`. EffectStream can only see what is in the public `ledger`.

**Example (`main.rs`):**
```rust
pragma language_version >= 0.18.0;

import CompactStandardLibrary;

// This is the public state that EffectStream's primitive will monitor.
export ledger round: Counter;

// This is a private state transition. When executed, it generates a ZK proof.
// Its effect is made visible to EffectStream by the change it causes to the public `round` state.
export circuit increment(): [] {
  round.increment(1);
}
```

### Primitives
*   **`PrimitiveTypeMidnightGeneric`**: Monitors the public `ledger` export of a Compact contract. Whenever a circuit modifies this public state, the primitive triggers.

```ts
import { PrimitiveTypeMidnightGeneric } from "@effectstream/sm/builtin";
import * as MyContract from "@my-project/midnight-contract/contract";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  (network, deployments, syncProtocol) => ({
    name: "MidnightGameState",
    type: PrimitiveTypeMidnightGeneric,
    contractAddress: "...",
    contract: { ledger: MyContract.ledger }, // The ledger definition from Compact compilation
    stateMachinePrefix: "midnight-state-change",
  })
)
```

In addition to contract state, four ledger-level primitives surface raw zswap
activity (no contract address needed) — each emits a state-machine input under
its `stateMachinePrefix`. They underpin the `zswap-da` template's offer-liveness
checks (is a coin spent? does a UTXO exist? is a Merkle root real and recent?):

*   **`PrimitiveTypeMidnightNullifier`**: emits each shielded coin **nullifier** as it is consumed (a spend). Payload `{ nullifier, txHash, eventId, logicalSegment }`.
*   **`PrimitiveTypeMidnightUnshieldedSpend`**: emits each **unshielded UTXO spend** as `{ owner, intentHash, outputIndex, value, tokenType, txHash }`. See [Unshielded UTXO tracking](#unshielded-utxo-tracking--unshieldedspend--unshieldedcreate) below.
*   **`PrimitiveTypeMidnightUnshieldedCreate`**: emits each **unshielded UTXO creation** (regular **and** system transactions — rewards/bridge mint UTXOs) as `{ owner, intentHash, outputIndex, value, tokenType, txHash }`. The existence counterpart of `UnshieldedSpend`.
*   **`PrimitiveTypeMidnightZswapRoot`**: emits the zswap coin-commitment Merkle tree **root** as it advances (the last `RegularTransaction.zswapMerkleTreeRoot` of each block) as `{ root, txHash }`.

```ts
import {
  PrimitiveTypeMidnightUnshieldedCreate,
  PrimitiveTypeMidnightZswapRoot,
} from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  () => ({
    name: "Midnight-ZswapRoot",
    type: PrimitiveTypeMidnightZswapRoot,
    startBlockHeight: 1,
    stateMachinePrefix: "midnight-zswap-root",
    networkId: midnightNetworkConfig.id,
  }),
)
```

#### Unshielded UTXO tracking — `UnshieldedSpend` / `UnshieldedCreate`

Unshielded (transparent) tokens on Midnight are plain UTXOs — unlike shielded
zswap coins there is **no nullifier and no commitment**. The ledger identifies
every unshielded UTXO by one deterministic, public pair:

> **`(intentHash, outputIndex)` of the intent that *created* it.**

A spend does not get its own mark: the ledger removes the UTXO from its set,
and the spend is reported under the *same* `(intentHash, outputIndex)` the
UTXO was created with. This makes the two primitives a natural join:

```sql
-- lifecycle of one UTXO: its creation row and (if consumed) its spend row
SELECT c.*, s.tx_hash AS spent_in
FROM   unshielded_creates c
LEFT JOIN unshielded_spends s
  ON  (s.intent_hash, s.output_index) = (c.intent_hash, c.output_index);
```

##### Payload reference

Both primitives emit the same shape (one state-machine input per UTXO):

| Field | Type | Meaning |
|---|---|---|
| `owner` | `string` | Bech32m address (`mn_addr…`) — the UTXO's owner, on **both** creates and spends |
| `intentHash` | `string` (hex) | Hash of the **creating** intent — the UTXO's identity, *not* the transaction hash |
| `outputIndex` | `number` | Position in the creating intent's (sorted) output list |
| `value` | `string` | u128 amount as a decimal string |
| `tokenType` | `string` (hex) | Serialized token type (all-zeros = native NIGHT) |
| `txHash` | `string` | The transaction this event was observed in: the *creating* tx for creates, the *spending* tx for spends |

##### `intentHash` is not the transaction hash

A Midnight transaction is a bag of **intents** (potentially unbalanced partial
transactions, merged before submission). `intentHash` is computed per
`(intent, segment)`, so:

*   one transaction can carry **several distinct intent hashes** — e.g. an
    atomic swap is an *offer intent* (declares unshielded token deltas) merged
    with a counterparty's *balancing intent*;
*   two UTXOs created by the same transaction can have different `intentHash`
    values (one per intent), while sharing `txHash`;
*   system transactions (block rewards, bridge mints) derive a special intent
    hash — `UnshieldedCreate` still reports them.

Track offer settlement by joining spends to creates on the identity pair, or
reconstruct per-token **deltas** for a transaction by summing
`spends − creates` grouped by `tokenType` over its `txHash`.

##### Configuration

No contract address is needed — the primitives observe the whole ledger:

```ts
import {
  PrimitiveTypeMidnightUnshieldedCreate,
  PrimitiveTypeMidnightUnshieldedSpend,
} from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  () => ({
    name: "Midnight-UnshieldedSpend",
    type: PrimitiveTypeMidnightUnshieldedSpend,
    startBlockHeight: 1,
    stateMachinePrefix: "unshielded-spend",
    networkId: midnightNetworkConfig.id,
  }),
)
```

and a matching STF:

```ts
stm.addStateTransition("unshielded-spend", function* (data) {
  const { owner, intentHash, outputIndex, value, tokenType, txHash } =
    data.parsedInput.payload;
  // e.g. mark the (intentHash, outputIndex) UTXO as consumed
});
```

:::info Indexer cost
`value` and `tokenType` ride on the **same** indexer query the primitives
already issue — enabling them adds fields to an existing selection, not extra
requests.
:::

The e2e suite exercises the full flow with a real unshielded swap — an
`initSwap` offer intent completed by a separate balancing intent — asserting
the exact `(intentHash, outputIndex, value)` marks read off the submitted
transaction land in both tables (`e2e/midnight/run-tests.ts`, tests
"unshielded swap spends/creates captured").

#### Token mints — resolving a token id to its minting contract

:::warning Upgrading from `0.101.1`

`0.101.1` shipped this primitive with a single opaque `payload` field. The payload is
now **flat named fields**, so an existing integration needs two edits:

1. **Grammar entry** — replace `[["payload", Type.Any()]]` with
   `builtinGrammars.midnightTokenMint`. The primitive now emits seven values where it
   used to emit one, so a one-field grammar entry no longer matches the input.
2. **Handler** — read the fields directly instead of unwrapping the blob:
   `const { rawTokenType, kind } = data.parsedInput` rather than
   `const { payload } = data.parsedInput; payload.rawTokenType`. Watch for handlers
   written defensively as `String(payload?.rawTokenType ?? "")` — those keep running
   and quietly write empty strings.

Anything reading `effectstream.primitive_accounting.payload` in SQL is affected the same
way: the fields moved up one level, so `payload->'payload'->>'rawTokenType'` becomes
`payload->>'rawTokenType'`.

Also note that upgrading creates the registry table described below for existing
integrations, since `persist` defaults to `true`. Set `persist: false` to keep the old
behavior of recording mints without a table.

:::

*   **`PrimitiveTypeMidnightTokenMint`**: emits each custom token **mint** performed by a
    contract call — shielded and unshielded — as
    `{ contractAddress, domainSep, rawTokenType, kind, amount, txHash, entryPoint }`.
    `rawTokenType` is the wallet-visible token id ("color"), derived on chain as
    `rawTokenType(domainSep, contractAddress)`; `kind` is `"shielded"` or `"unshielded"`,
    and `amount` is a decimal **string** because a `u64` mint can exceed
    `Number.MAX_SAFE_INTEGER`. The mint nonce is not part of token identity (it only
    randomizes coin commitments) and is never public for shielded mints, so it is not
    reported.

Unlike the primitives above, this one also keeps the registry for you. Configuring it
creates `primitives.midnight_token_mint_view_<name>` and keeps it up to date: one row per
`(token_type, kind)` carrying the minting `contract_address` and `domain_sep`, an
accumulating `total_minted`, and the `tx_hash`/`block_height` of the first mint. This is
the mapping a wallet cannot give you — it resolves a token id you can see in a balance
back to the contract that created it. See
[Primitive Tables](../100-components/109-database.md#primitive-tables) for how `<name>` is
derived from the primitive's `name`.

```ts
import { PrimitiveTypeMidnightTokenMint } from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelMidnight,
  () => ({
    name: "Midnight-TokenMint",
    type: PrimitiveTypeMidnightTokenMint,
    startBlockHeight: 1,
    // Optional: also run an STF for every mint. The registry table is filled
    // either way — pass `undefined` if you only want the table.
    stateMachinePrefix: "midnight-token-mint",
    networkId: midnightNetworkConfig.id,
  }),
)
```

Two config knobs are specific to this primitive:

*   `persist` (default `true`) — set it to `false` to skip creating the registry table on a
    fresh database. Mint events are still recorded, so you can consolidate them yourself
    in an STF.
*   `stateMachinePrefix` — independent of `persist`. Setting it emits one state-machine
    input per mint **in addition to** maintaining the table; the grammar is exported as
    `builtinGrammars.midnightTokenMint`, so your handler reads the payload's named fields
    directly:

```ts
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "midnight-token-mint": builtinGrammars.midnightTokenMint,
} as const satisfies GrammarDefinition;

stm.addStateTransition("midnight-token-mint", function* (data) {
  const { rawTokenType, kind, contractAddress, amount } = data.parsedInput;
  // ... your own logic; the registry table is maintained regardless
});
```

## 2. Batcher Adapters (Write)

Writing to Midnight involves proving and submitting ZK circuits. EffectStream provides the `MidnightAdapter` to handle this complexity.

### Standard Midnight Adapter
The `MidnightAdapter` manages the ZK proof generation (via a proof server) and transaction submission.

```ts
import { MidnightAdapter } from "@effectstream/batcher-sdk";

const midnightAdapter = new MidnightAdapter(
  contractAddress,
  walletSeed,
  {
    indexer: "...",
    node: "...",
    proofServer: "http://localhost:6300",
    zkConfigPath: "path/to/zk/config",
    privateStateStoreName: "my-app-store",
  },
  new MyContract.Contract(witnesses),
  witnesses,
  contractInfo,
  NetworkId.Undeployed,
  "parallelMidnight"
);
```

The adapter uses `MidnightBatchBuilderLogic` to format inputs into circuit arguments compatible with the Compact runtime.

## 3. Browser Wallets (Connect)

Use `WalletMode.Midnight` to connect to Midnight wallets (like Lace).

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Midnight,
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected to Midnight:", wallet.walletAddress);
}
```

## 4. Cryptography (Verify)

You can validate Midnight addresses (`mn_...`) and specific Midnight-related cryptographic primitives using the `CryptoManager`.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

const signature = await signMessage(wallet, "Hello Midnight");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.MIDNIGHT);

// Validates 'mn_...' addresses for testnet/devnet/undeployed
const isValidAddress = crypto.verifyAddress(midnightAddress);

const isValidSig = await crypto.verifySignature(
  midnightAddress,
  "Hello Midnight",
  signature
);
```

## 5. Orchestration

Use `launchMidnight` from `@effectstream/orchestrator/start-midnight` to launch the full stack:
*   Midnight Node
*   GraphQL Indexer
*   Proof Server
*   Contract Deployment

**Optional log controls (per process)**

* `logsStartDisabled` (default: `false`): start with logs hidden in the TUI.
* `disableStderr` (default: `false`): stop forwarding stderr for that process (useful because Substrate-based binaries like Avail Node and Midnight Node emit INFO/DEBUG on stderr).

```ts
// in start.ts
processesToLaunch: [
  ...launchMidnight("@my-project/midnight-contracts"),
]
```

> NOTE: To use this launcher you need to implement some scripts in your project's `package.json`. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/midnight-contracts",
  "scripts": {
    "midnight-node:start": "CFG_PRESET=dev bun ./node_modules/.bin/npm-midnight-node --dev --rpc-port 9944 --state-pruning archive --blocks-pruning archive --public-addr /ip4/127.0.0.1 --unsafe-rpc-external",
    "midnight-node:wait": "wait-on tcp:9944",
    "midnight-indexer:start": "RUST_BACKTRACE=1 LEDGER_NETWORK_ID=\"Undeployed\" SUBSTRATE_NODE_WS_URL=\"ws://localhost:9944\" APP__INFRA__SECRET=$(openssl rand -hex 32 | tr 'a-f' 'A-F') FEATURES_WALLET_ENABLED=\"true\" APP__INFRA__NODE__URL=\"ws://localhost:9944\" bun ./node_modules/.bin/npm-midnight-indexer --binary --clean",
    "midnight-indexer:wait": "wait-on tcp:8088",
    "midnight-proof-server:start": "LEDGER_NETWORK_ID=\"Undeployed\" RUST_BACKTRACE=full SUBSTRATE_NODE_WS_URL=\"ws://localhost:9944\" bun ./node_modules/.bin/npm-midnight-proof-server",
    "midnight-proof-server:wait": "wait-on tcp:6300",
    "midnight-contract:clean": "rm -rf midnight-level-db contract-eip-20.json contract-counter.json",
    "midnight-contract:deploy": "bun run midnight-contract:clean && bun run contract-eip20:deploy && bun run contract-counter:deploy",
    "contract-counter:deploy": "bun ./contract-counter-deploy.ts",
    "contract-eip20:deploy": "bun ./contract-eip-20-deploy.ts"
  }
}