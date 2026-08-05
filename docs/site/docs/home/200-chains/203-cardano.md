# Cardano

EffectStream connects to Cardano to leverage its UTXO model and native assets. Syncing is typically handled via high-performance indexers.

## 1. Configuration (Read)

### Network Definition
```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "cardano",
    type: ConfigNetworkType.CARDANO,
    network: "yaci", // or "preview", "mainnet"
    nodeUrl: "http://127.0.0.1:10000", // e.g. Yaci Devkit
  })
)
```

### Sync Protocol
EffectStream supports syncing via **UTXO-RPC** (using Dolos/Yaci) or **Carp**.

```ts
// Example using UTXO-RPC (Dolos)
.addParallel(
  (networks) => networks.cardano,
  (network, deployments) => ({
    name: "parallelUtxoRpc",
    type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
    rpcUrl: "http://127.0.0.1:50051", // UTXO-RPC endpoint
    startChainPoint: { slot: 1, hash: "abc123..." }, // slot and block hash to start syncing from
  })
)
```

### Primitives

All Cardano primitives use [Dolos](https://github.com/txpipe/dolos) via the UTxORPC Watch module for real-time transaction streaming. Each primitive specifies a UTxORPC predicate that filters transactions at the source, so only relevant data reaches your application.

```ts
import {
  PrimitiveTypeCardanoDelayedAsset,
  PrimitiveTypeCardanoMintBurn,
  PrimitiveTypeCardanoPoolDelegation,
  PrimitiveTypeCardanoProjectedNFT,
  PrimitiveTypeCardanoTransfer,
} from "@effectstream/sm/builtin";
```

#### Delayed Asset (`PrimitiveTypeCardanoDelayedAsset`)

Tracks the creation and spending of native asset UTxOs. "Delayed" refers to asset ownership only becoming final after on-chain confirmation (unlike account-model chains with instant balance updates). The primitive uses the `moves_asset` UTxORPC predicate filtered by policy ID.

Maintains an **IVM materialized view** (`cardano_asset_utxos_view_<name>`) with current unspent asset holdings - INSERTs on UTxO creation, DELETEs on spending.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "MyNativeAsset",
      type: PrimitiveTypeCardanoDelayedAsset,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-asset",
      policyIds: ["abcdef1234..."], // filter by policy ID
      network: "yaci",
    }),
  )
)
```

**Payload fields:**

| Field | Description |
| :--- | :--- |
| `address` | Recipient/owner address |
| `txId` | Transaction hash |
| `outputIndex` | Output position in the transaction |
| `cip14Fingerprint` | CIP-14 asset fingerprint (policy ID + asset name) |
| `amount` | Quantity (`null` signals the UTxO was spent) |
| `policyId` | Native asset policy ID |
| `assetName` | Asset name (hex-encoded) |

#### Mint/Burn (`PrimitiveTypeCardanoMintBurn`)

Captures native token minting and burning events. Positive quantities indicate mints; negative indicate burns. Uses the `mints_asset` UTxORPC predicate filtered by policy ID.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "MyTokenMints",
      type: PrimitiveTypeCardanoMintBurn,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-mint",
      policyIds: ["abcdef1234..."],
      network: "yaci",
    }),
  )
)
```

**Payload fields:**

| Field | Description |
| :--- | :--- |
| `txId` | Transaction hash |
| `metadata` | JSON-stringified transaction metadata |
| `assets` | JSON array of `{amount, policyId, assetName}` |
| `inputAddresses` | JSON array of addresses that signed inputs |
| `outputAddresses` | JSON array of recipient addresses |

#### Pool Delegation (`PrimitiveTypeCardanoPoolDelegation`)

Tracks stake pool delegation changes. Monitors both pre-Conway (`stakeDelegation`) and Conway-era (`stakeRegDelegCert`, `stakeVoteDelegCert`) delegation certificates using the `has_certificate` UTxORPC predicate. Supports an optional `pools` allowlist to filter by specific stake pool key hashes.

Maintains an **IVM materialized view** (`cardano_pool_delegation_view_<name>`) with the current delegation per staking credential - UPSERTs on each delegation change.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "CardanoPoolDelegation",
      type: PrimitiveTypeCardanoPoolDelegation,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-pool-delegation",
      pools: ["7301761068762f..."], // optional: only watch these pools
      network: "yaci",
    }),
  )
)
```

**Payload fields:**

| Field | Description |
| :--- | :--- |
| `address` | Staking credential hash |
| `pool` | Target stake pool key hash |
| `epoch` | Network epoch at delegation time |

See the [cardano-delegation template](https://github.com/effectstream/effectstream/tree/main/templates/cardano-delegation) for a complete working example including a React frontend.

#### Projected NFT (`PrimitiveTypeCardanoProjectedNFT`)

Tracks the lock → unlock → claim lifecycle of NFTs locked at a Plutus script (hololocker). This enables "projecting" on-chain NFTs into off-chain game state while they remain provably locked on-chain. Uses the `has_address` UTxORPC predicate filtered by the script address.

Maintains an **IVM materialized view** (`cardano_projected_nft_view_<name>`) - UPSERTs on Lock/Unlocking transitions, DELETEs on Claims.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "GameNFTLocker",
      type: PrimitiveTypeCardanoProjectedNFT,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-projected-nft",
      scriptHash: "abc123...", // hololocker script hash
      network: "yaci",
    }),
  )
)
```

**Payload fields:**

| Field | Description |
| :--- | :--- |
| `ownerAddress` | Owner hash parsed from datum (PKH/NFT/Receipt) |
| `previousTxId` | Previous transaction hash (for state transitions) |
| `previousOutputIndex` | Previous output index |
| `currentTxId` | Current transaction hash |
| `currentOutputIndex` | Current output index |
| `policyId` | Native asset policy ID |
| `assetName` | Native asset name |
| `status` | `Lock`, `Unlocking`, or `Claim` |
| `forHowLong` | Time-lock expiry (for `Unlocking` status) |

#### Transfer (`PrimitiveTypeCardanoTransfer`)

Captures ADA and native asset transfers. Tracks outputs (destination UTxOs) and input credentials (payment authorization). The UTxORPC predicate is user-provided, typically `has_address` to watch specific addresses.

```ts
.buildPrimitives(builder =>
  builder.addPrimitive(
    (sp) => sp.parallelUtxoRpc,
    () => ({
      name: "WatchMyAddress",
      type: PrimitiveTypeCardanoTransfer,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-transfer",
      predicate: {
        match: { cardano: { has_address: { exact_address: "addr_test1..." } } },
      },
      network: "yaci",
    }),
  )
)
```

**Payload fields:**

| Field | Description |
| :--- | :--- |
| `txId` | Transaction hash |
| `metadata` | JSON-stringified transaction metadata |
| `inputCredentials` | JSON array of verification key hashes that signed inputs |
| `outputs` | JSON array of `{index, address, coin, assets[]}` |

## 2. Batcher Adapters (Write)

To write to Cardano, you must implement a `BlockchainAdapter` that constructs Cardano transactions.

Since Cardano uses a UTXO model, the adapter typically needs to:
1.  Query available UTXOs for the batcher wallet.
2.  Construct a transaction using a library like `lucid` or `mesh`.
3.  Sign and submit via the node or an API like Ogmios.

```ts
// Conceptual Custom Adapter
class CardanoAdapter implements BlockchainAdapter {
  async submitBatch(data: any) {
    // 1. Build TX with data embedded in Metadata or Datum
    // 2. Sign with stored private key
    // 3. Submit
  }
}
```

## 3. Browser Wallets (Connect)

Use `WalletMode.Cardano` to connect to Cardano wallets (Nami, Eternl, Flint, etc.).

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Cardano,
  // Optional: prefer a specific wallet extension
  preference: { name: "nami" }, 
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected Cardano Address:", wallet.walletAddress);
}
```

## 4. Cryptography (Verify)

EffectStream includes the logic to verify **CIP-30/CIP-8 Data Signatures**. This allows you to authenticate user actions signed by Cardano wallets.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

// Note: Cardano wallets often sign hex payloads or structured data
const signature = await signMessage(wallet, "Hello Cardano");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.CARDANO);

// 1. Verify Cardano Address (Bech32)
const isValidAddr = crypto.verifyAddress("addr_test1...");

// 2. Verify Data Signature (CIP-30)
// Note: 'signatureStruct' usually contains the signature + key (e.g., "sig+key")
const isValidSig = await crypto.verifySignature(
  userAddress, 
  "Hello Cardano", 
  signatureStruct
);
```

## 5. Orchestration

Use `launchCardano` from `@effectstream/orchestrator/launch-cardano` to launch a local environment using **Yaci Devkit** and **Dolos**.

```ts
// in start.dev.ts
import path from "node:path";
import { launchCardano } from "@effectstream/orchestrator/launch-cardano";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchCardano("@my-project/cardano-contracts", {
      cwd: path.join(root, "packages/contracts-cardano"),
    }),
  ],
} satisfies OrchestratorConfig;
```

> NOTE: To use this launcher you need to implement some scripts in your project's `package.json`. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/cardano-contracts",
  "scripts": {
    "devkit:start": "bun ./node_modules/.bin/yaci-devkit up",
    "devkit:wait": "wait-on tcp:3001",
    "dolos:fill-template": "bun ./fill-template.ts",
    "dolos:start": "rm -rf ./data && rm -rf ./dolos.socket && bun run dolos:fill-template && bun ./node_modules/.bin/dolos bootstrap relay && bun ./node_modules/.bin/dolos daemon",
    "dolos:wait": "wait-on tcp:50051"
  }
}
```