# Celestia

Celestia is a modular Data Availability (DA) layer. In EffectStream, it is used to post and retrieve data blobs via namespaced blob transactions, giving applications cheap, secure, and verifiable data availability.

## 1. Configuration (Read)

### Network Definition
```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "celestia",
    type: ConfigNetworkType.CELESTIA,
    rpcUrl: "http://127.0.0.1:26658", // Celestia Light Node RPC
  })
)
```

### Sync Protocol
The `CELESTIA_PARALLEL` protocol connects to a Celestia Light Node (or Bridge Node) via its JSON-RPC API. Celestia uses CometBFT consensus with ~12-second block times and instant (1-block) finality.

```ts
.addParallel(
  (networks) => networks.celestia,
  () => ({
    name: "parallelCelestia",
    type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
    startBlockHeight: 1,
    pollingInterval: 500,    // ms between polls
    delayMs: 12_000,         // waiting period (~1 block time)
    confirmationDepth: 1,    // CometBFT has instant finality
  }),
)
```

| Field | Description |
| :--- | :--- |
| `pollingInterval` | Milliseconds between each poll for new blocks. |
| `delayMs` | Waiting period before processing a block (recommended: 12000ms, one block time). |
| `confirmationDepth` | Number of confirmations to wait. `1` is sufficient for CometBFT's instant finality. |
| `stepSize` | *(Optional)* Number of blocks to fetch per poll cycle. Default: `10`. |

### Primitives
*   **`PrimitiveTypeCelestiaGeneric`**: Watches a Celestia namespace for data blobs and feeds the decoded content into the state machine.

```ts
import { PrimitiveTypeCelestiaGeneric } from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelCelestia,
  () => ({
    name: "ZswapBlob",
    type: PrimitiveTypeCelestiaGeneric,
    startBlockHeight: 1,
    namespace: "000000000000deadbeef",  // hex-encoded namespace
    stateMachinePrefix: "celestia-zswap",
  }),
)
```

**What the state machine receives** (`data.parsedInput.payload`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `suppliedValue` | `string` | The blob body as a binary string: `atob` of the blob's base64 data, one character per byte (`\u0000`–`ÿ`). `Buffer.from(suppliedValue, "latin1")` gives the bytes back. |

The grammar carries only `suppliedValue`. The state machine gets every body in full; store what you need from it in your own tables.

**What the engine keeps** (`effectstream.primitive_accounting`, one `CELESTIA:Generic` row per blob, read with `payload->'payload'->>'…'`):

| Field | Type | Description |
| :--- | :--- | :--- |
| `namespace` | `string` | The hex namespace configured on the primitive. |
| `commitment` | `string` | The blob commitment, base64. |
| `blobIndex` | `number` | Index of the blob within its Celestia block. |
| `height` | `number` | The Celestia block height the blob was included at (not the rollup block height). |

The row is a reference, not a copy: `blob.Get(height, namespace, commitment)` fetches the blob again from a Celestia node (the namespace in its 29-byte base64 form). A blob posted again at another height or index gets its own row.

**Option `persistBody`** (default `false`): set `persistBody: true` in the primitive config to also store each body in its accounting row, as `bodyBase64`: standard padded base64, the same encoding `blob.Get` returns. Base64 text has no NUL character, so every Postgres JSON operator works on the row. Decode it with `decode(payload->'payload'->>'bodyBase64', 'base64')` in SQL, or `Buffer.from(bodyBase64, "base64")` (`atob` for a binary string) in JavaScript.

Enable it only if you accept the cost: **storage without limit**. A namespace is permissionless: whoever posts blobs to it decides how many bytes your node keeps, forever, at about 1.33 times each body.

## 2. Batcher Adapters (Write)

Use `CelestiaAdapter` to submit data blobs to a Celestia namespace via the Light Node JSON-RPC (`blob.Submit`).

```ts
import { CelestiaAdapter } from "@effectstream/batcher-sdk";

const celestiaAdapter = new CelestiaAdapter({
  rpcUrl: "http://127.0.0.1:26658",
  namespace: "000000000000deadbeef",
  network: "devnet",
  fee: 2000,
  gasLimit: 100000,
  syncProtocolName: "parallelCelestia",
});

batcher.addBlockchainAdapter("celestia", celestiaAdapter, {
  criteriaType: "size",
  maxBatchSize: 1,
});
```

**Configuration options:**

| Field | Default | Description |
| :--- | :--- | :--- |
| `rpcUrl` | *(required)* | Celestia Light/Bridge Node RPC URL. |
| `namespace` | *(required)* | Hex-encoded namespace to submit blobs to. |
| `authToken` | - | Optional Bearer token for authenticated RPC. |
| `network` | `"devnet"` | `"devnet"` or `"mainnet"` - controls fee/gas defaults. |
| `fee` | `2000` | Transaction fee (devnet). |
| `gasLimit` | `100000` | Gas limit (devnet). |
| `gasPrice` | - | Gas price (mainnet only). |
| `gas` | - | Gas amount (mainnet only). |
| `maxGasPrice` | - | Max gas price (mainnet only). |
| `txPriority` | - | Transaction priority (mainnet only). |
| `maxBlobBytes` | `1.5 MB` | Maximum blob size. Inputs exceeding this are rejected. |
| `maxRetries` | `4` | Number of retries on rate-limited RPC calls. |
| `baseDelayMs` | `1500` | Base delay for exponential backoff on retries. |
| `syncProtocolName` | `"parallelCelestia"` | Name of the sync protocol to link receipts to. |

## 3. Browser Wallets (Connect)

Celestia is a DA layer - user interactions are typically submitted through the batcher rather than directly from browser wallets. The batcher's bridge node holds the signing key and submits blobs on behalf of the application.

For applications that need to identify users, pair Celestia with another chain's wallet (e.g., EVM or Midnight) for authentication, and use Celestia purely for data availability.

## 4. Cryptography (Verify)

Celestia blobs are submitted by the bridge node, not end users. The primitive delivers blob data without an associated user address (`AddressType.NONE`). To attribute actions to users, include a signed payload inside the blob content and verify it in your state machine using the appropriate `CryptoManager` for the signing chain.

## 5. Orchestration

Use `launchCelestia` from `@effectstream/orchestrator/launch-celestia`. It cleans any stale devnet home, starts the consensus node and bridge, waits for the bridge RPC, and funds the bridge wallet.

```ts
// in start.dev.ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchCelestia } from "@effectstream/orchestrator/launch-celestia";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchCelestia("@my-project/contracts-celestia", {
      cwd: path.join(root, "packages/contracts-celestia"),
    }),
  ],
} satisfies OrchestratorConfig;
```

`launchCelestia` accepts an optional third argument to override the defaults:

| Option | Default | Purpose |
| --- | --- | --- |
| `ports` | `[26657, 26658]` | Consensus and bridge RPC ports, freed before launch. |
| `home` | `"/tmp/celestia-home"` | Celestia home directory, wiped on each start. |

> NOTE: To use this setup you need a `contracts-celestia` package in your project providing the scripts below. The reference implementation is [`e2e/shared/contracts/celestia`](https://github.com/effectstream/effectstream/tree/main/e2e/shared/contracts/celestia).

The contracts package needs these tasks in its `package.json`:

```json
{
  "name": "@my-project/contracts-celestia",
  "dependencies": {
    "@effectstream/celestia": "latest"
  },
  "scripts": {
    "celestia-bridge:start": "bun ./node_modules/.bin/celestia start-bridge --verbose",
    "celestia-bridge:wait": "wait-on tcp:26658",
    "celestia-fund:bridge": "bun ./fund-bridge.ts"
  }
}
```

The `fund-bridge.ts` script uses the `@effectstream/celestia` package to fund the bridge wallet:

```ts
import { fund, getBridgeAddress } from "@effectstream/celestia";

const address = await getBridgeAddress("http://localhost:26658");
await fund(address, "100000000utia", { appHome: process.env.CELESTIA_HOME });
```
