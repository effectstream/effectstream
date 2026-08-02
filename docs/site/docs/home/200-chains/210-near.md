# NEAR

EffectStream connects to NEAR Protocol's sharded PoS chain via its JSON-RPC. Sync coverage spans the NEP fungible/non-fungible/multi-token standards, generic NEP-297 events, raw FunctionCall capture, and DIP-4 cross-chain intent settlement. Writes go through a NEAR adapter that signs and submits FunctionCalls; intent settlement has its own adapter that submits DIP-4 messages to the NEAR Intents protocol.

## 1. Configuration (Read)

### Network Definition

```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "near",
    type: ConfigNetworkType.NEAR,
    rpcUrl: "http://localhost:3030", // NEAR JSON-RPC URL
    networkId: "localnet", // "mainnet" | "testnet" | "localnet" (default: "localnet")
  })
)
```

### Sync Protocol

The protocol type is `NEAR_RPC_PARALLEL`. It polls the NEAR JSON-RPC, batches blocks in `stepSize` chunks, and applies finality based on NEAR's doomslug (near-instant finality, `confirmationDepth: 1` by default).

```ts
.buildSyncProtocols(builder =>
  builder.addParallel(
    (networks) => networks.near,
    (network, deployments) => ({
      name: "parallelNearRPC",
      type: ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
      startBlockHeight: 1,
      pollingInterval: 2000,
      delayMs: 2400,
      confirmationDepth: 1,
      // stepSize: 10,   // optional - blocks per fetch batch (default: 10)
    })
  )
)
```

### Primitives

Six built-in primitives cover the standard NEAR event surface. All of them filter events at the source by NEP-297 `standard` + `event` fields (where applicable) and a target `contractId`.

```ts
import {
  PrimitiveTypeNEARGeneric,
  PrimitiveTypeNEARIntent,
  PrimitiveTypeNEARAccountWatch,
  PrimitiveTypeNEARNEP141,
  PrimitiveTypeNEARNEP171,
  PrimitiveTypeNEARNEP245,
} from "@effectstream/sm/builtin";
```

A complete working example exercising all six lives at [`e2e/near/config.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/near/config.ts).

#### Generic NEP-297 Event (`PrimitiveTypeNEARGeneric`)

Capture any NEP-297 event from a contract by `standard` + `event` strings. Use this when none of the typed primitives below match - for example, an application-specific NEP-297 emit. Each captured event lands in `effectstream.primitive_accounting` with the parsed event `data` field as payload.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearGenericEvent",
      type: PrimitiveTypeNEARGeneric,
      startBlockHeight: 0,
      contractId: "test.near",
      eventStandard: "test",
      eventType: "test_event",
      scheduledPrefix: "near-generic",
    }),
  )
)
```

#### Intent Settlement (`PrimitiveTypeNEARIntent`)

Captures DIP-4 `token_diff` settlement events emitted by a NEAR Intents Verifier contract (e.g. `intents.near` on mainnet, your local mock in dev). Each settlement is decomposed into per-account, per-token diffs and stored as an **IVM dynamic table** (`primitives.near_intent_settlement_intermediate_<name>`) keyed by `intent_hash`, `account_id`, `token_id`.

`token_id` follows the NEAR Intents convention: `nep141:<contract>`, `nep171:<contract>:<token>`, `nep245:<contract>:<token>`.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearIntentSettlement",
      type: PrimitiveTypeNEARIntent,
      startBlockHeight: 0,
      contractId: "intents.near",
      scheduledPrefix: "intent-settled",
      // Optional filters:
      // filterTokenIds: ["nep245:game.near:*"],
      // filterAccountIds: ["*.game.near"],
    }),
  )
)
```

Event-standard and event-type fields are hard-coded to `dip4` / `token_diff` - the primitive only watches that one signature.

#### Account Watch (`PrimitiveTypeNEARAccountWatch`)

Captures **every FunctionCall** made to a target contract, regardless of whether the call emits an NEP-297 event. Useful for tracking contract usage where the contract doesn't emit standardized events. The payload includes `method_name`, base64-decoded `args`, and the receipt outcome.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearAccountWatch",
      type: PrimitiveTypeNEARAccountWatch,
      startBlockHeight: 0,
      contractId: "test.near",
      scheduledPrefix: "near-account-watch",
    }),
  )
)
```

#### NEP-141 (Fungible Token) (`PrimitiveTypeNEARNEP141`)

Tracks `ft_transfer` events emitted by NEP-141 fungible token contracts. Maintains two IVM tables:

- `primitives.nep141_balance_intermediate_<name>` - per-block balance deltas per `account_id`.
- `primitives.nep141_balance_view_<name>` - aggregated current balance view (positive balances only).

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearNep141Transfer",
      type: PrimitiveTypeNEARNEP141,
      startBlockHeight: 0,
      contractId: "wrap.near",
      eventStandard: "nep141",
      eventType: "ft_transfer",
      scheduledPrefix: "nep141-transfer",
    }),
  )
)
```

**Payload fields:** `old_owner_id`, `new_owner_id`, `amount`, plus the NEP-297 envelope.

#### NEP-171 (Non-Fungible Token) (`PrimitiveTypeNEARNEP171`)

Tracks `nft_transfer` events from NEP-171 NFT contracts. Maintains IVM tables `primitives.nep171_owner_intermediate_<name>` and `primitives.nep171_owner_view_<name>` keyed by `token_id`.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearNep171Transfer",
      type: PrimitiveTypeNEARNEP171,
      startBlockHeight: 0,
      contractId: "nft.near",
      eventStandard: "nep171",
      eventType: "nft_transfer",
      scheduledPrefix: "nep171-transfer",
    }),
  )
)
```

#### NEP-245 (Multi-Token) (`PrimitiveTypeNEARNEP245`)

Tracks `mt_transfer` events from NEP-245 multi-token contracts (semi-fungible: each `token_id` has its own balance per account). Maintains IVM tables `primitives.nep245_balance_intermediate_<name>` and `primitives.nep245_balance_view_<name>` keyed by `(account_id, token_id)`.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelNearRPC,
    () => ({
      name: "NearNep245Transfer",
      type: PrimitiveTypeNEARNEP245,
      startBlockHeight: 0,
      contractId: "game.near",
      eventStandard: "nep245",
      eventType: "mt_transfer",
      scheduledPrefix: "nep245-transfer",
    }),
  )
)
```

## 2. Batcher Adapters (Write)

Two adapters ship for NEAR. Both sign locally with an Ed25519 private key (no `near-api-js` runtime dependency) and submit via JSON-RPC.

### Generic FunctionCall: `NearAdapter`

Batches application inputs and submits them as `FunctionCall` actions to a target contract method.

```ts
import { NearAdapter } from "@effectstream/batcher-sdk";

const adapter = new NearAdapter({
  rpcUrl: "https://rpc.mainnet.near.org",
  networkId: "mainnet",
  batcherAccountId: "batcher.near",
  batcherPrivateKey: "ed25519:...",          // hold securely
  contractAccountId: "game.near",
  contractMethod: "submitGameInputs",
  syncProtocolName: "parallelNearRPC",
  // gasPerCall: "300000000000000",          // optional, default 300 TGas
  // attachedDeposit: "0",                   // optional, default 0
  // maxBatchSize: 100,                      // optional
});
```

### DIP-4 Intent Settlement: `NearIntentAdapter`

Submits DIP-4 cross-chain intent messages to the NEAR Intents protocol.

```ts
import { NearIntentAdapter } from "@effectstream/batcher-sdk";

const intentAdapter = new NearIntentAdapter({
  rpcUrl: "https://rpc.mainnet.near.org",
  networkId: "mainnet",
  batcherAccountId: "solver.near",
  batcherPrivateKey: "ed25519:...",
  syncProtocolName: "parallelNearRPC",
});
```

## 3. Browser Wallets (Connect)

There is **no `WalletMode.NEAR` yet** - browser wallet connection (e.g. MyNearWallet, Meteor, Sender) is not part of `@effectstream/wallets` today. Applications that need to identify NEAR users from a browser have two options:

- **Pair with another chain's wallet** (e.g. EVM or Midnight) and treat NEAR purely as a sync + write target.
- **Use the NEAR wallet SDK directly** in your frontend (e.g. [`near-api-js`](https://github.com/near/near-api-js)), then post the signed action through the batcher.

`AddressType.NEAR` is defined in `@effectstream/utils` so NEAR account IDs can flow through the address-typed surfaces (events, schemas, primitive payloads), but the `CryptoManager` does not yet ship a NEAR verifier - see the next section.

## 4. Cryptography (Verify)

NEAR account IDs are recognized as `AddressType.NEAR`. There is **no built-in `CryptoManager` case for NEAR** at present (the chain set with built-in verifiers is EVM, Cardano, Polkadot, Algorand, Mina, Midnight - see `packages/effectstream-sdk/crypto/src/chains/`). If you need to verify NEAR signatures inside a state transition function, use [`near-api-js`](https://github.com/near/near-api-js) directly or import the Ed25519 primitives from `@noble/ed25519` and verify against the account's public key.

## 5. Orchestration

Use `launchNear` from `@effectstream/orchestrator/launch-near` to bring up a local NEAR sandbox alongside your other dev processes.

```ts
// in start.dev.ts
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite } from "@effectstream/orchestrator/launch-pglite";
import { launchNear } from "@effectstream/orchestrator/launch-near";

export default {
  processes: [
    ...launchPglite(),
    ...launchNear("@my-project/near-contracts", { resolveFrom: import.meta.dirname! }),
  ],
} satisfies OrchestratorConfig;
```

The `launchNear` helper expects your `near-contracts` workspace package to expose two scripts:

```json
{
  "name": "@my-project/near-contracts",
  "dependencies": {
    "@effectstream/near-sandbox": "latest"
  },
  "scripts": {
    "chain:start": "bun ./node_modules/.bin/near-sandbox",
    "chain:wait": "wait-on tcp:3030"
  }
}
```

A complete reference setup - sandbox launch, contract deploy, primitive tests - lives in the e2e suite at [`e2e/near/`](https://github.com/effectstream/effectstream/tree/main/e2e/near). In particular:

- [`e2e/near/launcher.cli.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/near/launcher.cli.ts) - orchestrator config that launches the sandbox, deploys a test contract, and starts the sync node.
- [`e2e/near/config.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/near/config.ts) - `ConfigBuilder` wiring for all six primitives against a single sandbox.
- [`e2e/near/sync/`](https://github.com/effectstream/effectstream/tree/main/e2e/near/sync) - one test file per primitive showing the expected `primitive_accounting` row shapes and IVM table contents.
