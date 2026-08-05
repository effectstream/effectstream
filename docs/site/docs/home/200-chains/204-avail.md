# Avail

Avail is a Data Availability (DA) layer. In EffectStream, it is often used to store the raw input data of the application cheaply and securely.

## 1. Configuration (Read)

### Network Definition
```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "avail",
    type: ConfigNetworkType.AVAIL,
    nodeUrl: "ws://127.0.0.1:9955/ws",
    // ... genesis config
  })
)
```

### Sync Protocol
The `AVAIL_PARALLEL` protocol connects to an Avail **Light Client**. This allows the node to verify data availability without running a full node.

```ts
.addParallel(
  (networks) => networks.avail,
  (network, deployments) => ({
    name: "parallelAvail",
    type: ConfigSyncProtocolType.AVAIL_PARALLEL,
    rpc: network.nodeUrl,
    lightClient: "http://127.0.0.1:7007", // Local light client API
    startBlockHeight: 1,
  })
)
```

### Primitives
*   **`PrimitiveTypeAvailGeneric`**: Listens for data blobs submitted to a specific `AppId`.

```ts
import { PrimitiveTypeAvailGeneric } from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelAvail,
  (network, deployments, syncProtocol) => ({
    name: "AvailData",
    type: PrimitiveTypeAvailGeneric,
    appId: 123, // Your Avail App ID
    stateMachinePrefix: "avail-data",
  })
)
```

## 2. Batcher Adapters (Write)

To submit data to Avail, use an adapter that interacts with the Avail SDK or Light Client.

```ts
// Conceptual usage
// The adapter would use `avail-js-sdk` to submit data blobs.
const availAdapter = new AvailAdapter(appId, seed, endpoint);
```
## 3. Browser Wallets (Connect)

You can connect using `WalletMode.AvailJs`. This is often used for development with a seed or connecting to specific Avail extensions.

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";
// Note: For Polkadot.js extension wallets, you might also use WalletMode.Polkadot

const result = await walletLogin({
  mode: WalletMode.AvailJs,
  // An active connection to an Avail node (polkadot-js `ApiPromise`).
  connection,
  seed: "your test seed phrase",
  preferBatchedMode: true,
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected Avail Address:", wallet.walletAddress);
}
```

## 4. Cryptography (Verify)

Avail uses the Substrate address format (SS58). You can verify these addresses and signatures using the `CryptoManager`'s Polkadot implementation.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

const signature = await signMessage(wallet, "Hello Avail");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";

// Avail addresses are SS58/Substrate, so they are verified with the Polkadot
// implementation. Note that `getCryptoManager(AddressType.AVAIL)` throws —
// there is no dedicated AVAIL verifier.
const crypto = CryptoManager.Polkadot();

// 1. Verify Avail/Substrate Address
const isValid = crypto.verifyAddress(userAddress);

// 2. Verify Signature (sr25519/ed25519)
const isAuthorized = await crypto.verifySignature(
  userAddress,
  "Hello Avail",
  signature
);
```

## 5. Orchestration

Use `launchAvail` from `@effectstream/orchestrator/launch-avail`. This starts:
1.  A local Avail Node.
2.  An Avail Light Client connected to that node.

```ts
// in start.dev.ts
import path from "node:path";
import { launchAvail } from "@effectstream/orchestrator/launch-avail";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchAvail("@my-project/avail-contracts", {
      cwd: path.join(root, "packages/contracts-avail"),
    }),
  ],
} satisfies OrchestratorConfig;
```

> NOTE: To use this launcher you need to implement some scripts in your project's `package.json`. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/avail-contracts",
  "scripts": {
    "avail-node:start": "bun ./node_modules/.bin/npm-avail-node --dev --rpc-port 9955 --no-telemetry",
    "avail-node:wait": "wait-on tcp:9955",
    "avail-light-client:deploy": "bun run avail-light-client:clean && bun ./deploy.ts",
    "avail-light-client:start": "bun ./node_modules/.bin/npm-avail-light-client --config ./config.yml --app-id $AVAIL_APP_ID",
    "avail-light-client:wait": "wait-on tcp:7007",
    "avail-light-client:clean": "rm -rf ./avail_path"
  }
}