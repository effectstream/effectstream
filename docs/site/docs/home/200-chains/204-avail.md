# Avail

Avail is a Data Availability (DA) layer. In Effectstream, it is often used to store the raw input data of the application cheaply and securely.

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

## 3. Orchestration

Use `launchAvail` from `@effectstream/orchestrator/start-avail`. This starts:
1.  A local Avail Node.
2.  An Avail Light Client connected to that node.

```ts
// in start.ts
processesToLaunch: [
  ...launchAvail("@my-project/avail-contracts"),
]
```

> NOTE: To use this launcher you need to implement some `deno task` in your project. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/avail-contracts",
  ...
  "tasks": {
    "avail-node:start": "deno run -A --unstable-detect-cjs @effectstream/npm-avail-node --dev --rpc-port 9955 --no-telemetry",
    "avail-node:wait": "wait-on tcp:9955",
    "avail-light-client:deploy": "deno task avail-light-client:clean && deno run -A --unstable-detect-cjs ./deploy.ts",
    "avail-light-client:start": "deno run -A --unstable-detect-cjs @effectstream/npm-avail-light-client --config ./config.yml --app-id $AVAIL_APP_ID",
    "avail-light-client:wait": "wait-on tcp:7007",
    "avail-light-client:clean": "rm -rf ./avail_path"
  }
}