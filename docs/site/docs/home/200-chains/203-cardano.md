# Cardano

Effectstream connects to Cardano to leverage its UTXO model and native assets. Syncing is typically handled via high-performance indexers.

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
Effectstream supports syncing via **UTXO-RPC** (using Dolos/Yaci) or **Carp**.

```ts
// Example using UTXO-RPC (Dolos)
.addParallel(
  (networks) => networks.cardano,
  (network, deployments) => ({
    name: "parallelUtxoRpc",
    type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
    rpcUrl: "http://127.0.0.1:50051", // UTXO-RPC endpoint
    startSlot: 1,
  })
)
```

### Primitives
Effectstream provides primitives to track specific UTXO patterns, policy IDs (Native Assets), or metadata labels.
*(Note: Check `@effectstream/sm/builtin` for the latest list of available Cardano primitives)*.

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

Effectstream includes the logic to verify **CIP-30/CIP-8 Data Signatures**. This allows you to authenticate user actions signed by Cardano wallets.

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

Use `launchCardano` from `@effectstream/orchestrator/start-cardano` to launch a local environment using **Yaci Devkit** and **Dolos**.

```ts
// in start.ts
processesToLaunch: [
  ...launchCardano("@my-project/cardano-contracts"),
]
```

> NOTE: To use this launcher you need to implement some `deno task` in your project. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/cardano-contracts",
  ...
  "tasks": {
    "devkit:start": "deno run -A --node-modules-dir npm:@bloxbean/yaci-devkit up",
    "devkit:wait": "wait-on tcp:3001",
    "dolos:fill-template": "deno run -A ./fill-template.ts",
    "dolos:start": "rm -rf ./data && rm -rf ./dolos.socket && deno task dolos:fill-template && deno run -A --node-modules-dir npm:@txpipe/dolos bootstrap relay && deno run -A --node-modules-dir npm:@txpipe/dolos daemon",
    "dolos:wait": "wait-on tcp:50051" // utxorpc port
  }
}
```