# Bitcoin

Effectstream supports connecting directly to the Bitcoin network (including Regtest for development). This allows you to build dApps that react to native Bitcoin transactions, such as ordinals, runes, or standard payments.

## 1. Configuration (Read)

### Network Definition
Configure the connection to a Bitcoin Core node (RPC).

```ts
.buildNetworks(builder =>
  builder.addNetwork({
    name: "bitcoin",
    type: ConfigNetworkType.BITCOIN,
    rpcUrl: "http://127.0.0.1:18443",
    rpcAuth: {
      username: "dev",
      password: "devpassword",
    },
    network: "regtest", // or mainnet, testnet
  })
)
```

### Sync Protocol
Use `BITCOIN_RPC_PARALLEL` to poll the Bitcoin node for blocks.

```ts
.addParallel(
  (networks) => networks.bitcoin,
  (network, deployments) => ({
    name: "parallelBitcoin",
    type: ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
    rpcUrl: "http://127.0.0.1:18443",
    startBlockHeight: 0,
    pollingInterval: 10_000,
    confirmationDepth: 1,
  })
)
```

### Primitives
*   **`PrimitiveTypeBitcoinAddress`**: Monitors a specific Bitcoin address (P2PKH, P2WPKH, etc.) for incoming or outgoing transactions.

```ts
import { PrimitiveTypeBitcoinAddress } from "@effectstream/sm/builtin";

.addPrimitive(
  (syncProtocols) => syncProtocols.parallelBitcoin,
  (network, deployments, syncProtocol) => ({
    name: "Watch-System-Wallet",
    type: PrimitiveTypeBitcoinAddress,
    watchAddress: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03", // Bech32 address
    stateMachinePrefix: "bitcoin-tx",
  })
)
```

## 2. Batcher Adapters (Write)

To submit transactions to Bitcoin (e.g., for settlement or payments), you use the `BitcoinAdapter`.

### Bitcoin Adapter
This adapter manages UTXO selection, transaction building (PSBT), and signing using `bitcoinjs-lib`.

```ts
import { BitcoinAdapter } from "@effectstream/batcher";

const bitcoinAdapter = new BitcoinAdapter({
  rpcUrl: "http://127.0.0.1:18443",
  rpcUser: "dev",
  rpcPass: "devpassword",
  seed: "your-wallet-seed-phrase", // Used to derive keys for signing
  network: "regtest"
});
```

## 3. Orchestration

Use `launchBitcoin` from `@effectstream/orchestrator/start-bitcoin`. This spins up a local **Bitcoin Core** node in regtest mode.

```ts
// in start.ts
processesToLaunch: [
  ...launchBitcoin("@my-project/bitcoin-contracts"),
]
```

It is also common to include a process to mine blocks automatically in the background to ensure transaction processing during development.

> NOTE: To use this launcher you need to implement some `deno task` in your project. A working implementation is provided in the `template generator`, `templates` or `e2e tests`.

```json
{
  "name": "@e2e/bitcoin-contracts",
  ...
  "tasks": {
    "chain:start": "deno run -A @effectstream/bitcoin-core",
    "chain:wait": "wait-on tcp:18443",
    "generate:blocks": "deno run -A ./generate-blocks.ts",
    "wait-for-block": "deno run -A wait-for-block.ts"
  }
}