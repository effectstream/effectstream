---
title: "@effectstream/midnight-contracts"
description: "Midnight network contract interfaces for EffectStream"
sidebar_label: "midnight-contracts"
---

<!-- Generated from packages/chains/midnight-contracts/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/midnight-contracts`](https://www.npmjs.com/package/@effectstream/midnight-contracts)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/chains/midnight-contracts)

Utilities for reading and deploying Midnight contracts from inside an Effectstream node or test. Two functions: `readMidnightContract` to load contract metadata + ABI by name, and `deployMidnightContract` to deploy and persist the resulting address.

- Reads contract files by name, searching from the current working directory upward.
- Supports per-network files (`contract-counter.undeployed.json`, `contract-counter.testnet.json`) without hardcoded paths.
- Deploys against the local Midnight stack by default; set `MIDNIGHT_NETWORK_ID` (see [Network endpoints](#network-endpoints)) or pass `NetworkUrls` to point at another environment.
- Persists the deployed address to a JSON file so subsequent reads pick it up automatically.

## Install

```bash
bun add @effectstream/midnight-contracts
# or
npm install @effectstream/midnight-contracts
```

Requires a reachable Midnight node, proof server, and indexer. The `undeployed` defaults match what `@effectstream/orchestrator`'s Midnight step boots locally; `preview`, `preprod` and `mainnet` default to Blockfrost and need a Blockfrost project token (see [Network endpoints](#network-endpoints)).

## Standalone usage

### Read a contract

```typescript
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

// Defaults to contract-counter.<networkId>.json, where networkId is "undeployed".
const local = readMidnightContract("contract-counter");

// Read the same contract on a different network.
const preview = readMidnightContract("contract-counter", { networkId: "preview" });

// Override the search base if your contracts live outside the CWD tree.
const custom = readMidnightContract("contract-counter", {
  baseDir: "/path/to/contracts",
  networkId: "undeployed",
});
```

Returns `{ contractAddress, contractInfo, zkConfigPath }`. Results are cached per `(location, name, filename)` tuple so repeated reads in the same process are free.

### Deploy a contract

Only `contractName` and `contractClass` are required - everything else has a sensible default, so a minimal deploy is just:

```typescript
import {
  deployMidnightContract,
  type DeployConfig,
  type NetworkUrls,
} from "@effectstream/midnight-contracts/deploy";

// contractName must match the directory that holds `src/managed`;
// contractClass is the compiled Contract (e.g. `export * as Counter from "./managed/contract"`).
const address = await deployMidnightContract({
  contractName: "contract-counter",
  contractClass: Counter.Contract,
});
```

Supply the rest only when your contract needs it:

```typescript
const config: DeployConfig = {
  contractName: "contract-counter",
  contractClass: Counter.Contract,
  witnesses,                              // default: {} (no witnesses)
  privateStateId: "counterPrivateState",  // default: "privateState"
  initialPrivateState: { privateCounter: 0 }, // default: {} (no private state)
  contractFileName: "contract-counter.json",  // default: `${contractName}.json`
};

const address = await deployMidnightContract(config);
```

To deploy against a non-default stack, pass `NetworkUrls`:

```typescript
const network: NetworkUrls = {
  indexer: "http://localhost:8088/api/v4/graphql",
  indexerWS: "ws://localhost:8088/api/v4/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
};

const address = await deployMidnightContract(config, network);
```

The deploy helper creates and funds a wallet from the genesis mint seed, runs the deployment, and writes the resulting address to `${contractName}.${networkId}.json` so the next `readMidnightContract` call picks it up.

### Contracts with many circuits (phased deployment)

A standard deploy carries every circuit's verifier key in a single transaction. For contracts with enough circuits, that transaction exceeds the node's per-block limits and fails with `Transaction would exhaust block limits`. Set `phasedVerifierKeys: true` to instead deploy the contract with no verifier keys and then insert each circuit's key in its own transaction:

```typescript
const address = await deployMidnightContract({
  ...config,
  phasedVerifierKeys: true, // opt-in; default is a single-transaction deploy
});
```

Phased mode writes progress to a resume-state file (`deployment-state.json` by default) and removes it on success, so an interrupted run can be re-run to continue from the last inserted circuit instead of redeploying. Tunables:

- `phasedVerifierKeys?: boolean` - enable phased deployment (default `false`).
- `vkInsertRetries?: number` - per-circuit retry count for key insertion (default `3`).
- `phasedStateFile?: string` - resume-state file path (default `deployment-state.json` in the CWD).

The circuit list is enumerated automatically from the contract's compiled `keys/` directory, so no per-contract configuration is required.

## Network endpoints

`@effectstream/midnight-contracts/midnight-env` resolves `midnightNetworkConfig` once, when it is first imported, from environment variables. `deployMidnightContract` uses it for every `NetworkUrls` field you leave unset. `MIDNIGHT_NETWORK_ID` selects the network (default `undeployed`):

| `MIDNIGHT_NETWORK_ID` | `indexer` | `indexerWS` | `node` |
|---|---|---|---|
| `undeployed` (default) | `http://127.0.0.1:8088/api/v4/graphql` | `ws://127.0.0.1:8088/api/v4/graphql/ws` | `http://127.0.0.1:9944` |
| `preview`, `preprod`, `mainnet` | `https://midnight-<id>.blockfrost.io/api/v0?project_id=<token>` | `wss://midnight-<id>.blockfrost.io/api/v0/ws?project_id=<token>` | `https://rpc.midnight-<id>.blockfrost.io?project_id=<token>` |

The proof server defaults to `http://127.0.0.1:6300` on every network. The Blockfrost indexer serves the same GraphQL API at `/api/v0` (WebSocket `/api/v0/ws`) rather than `/api/v4/graphql`.

| Variable | Effect |
|---|---|
| `MIDNIGHT_NETWORK_ID` | Network to target: `undeployed`, `preview`, `preprod`, `mainnet`, or any other ID together with all three URL overrides. |
| `MIDNIGHT_BLOCKFROST_PROJECT_ID` | Blockfrost project token for the selected network, appended as `?project_id=<token>` to all three hosted URLs. Create one free project per network at [blockfrost.io](https://blockfrost.io); preprod tokens start with `nightpreprod`, mainnet tokens with `nightmainnet`. A token issued for another network is sent unchanged and Blockfrost rejects it (HTTP 403 "Network token mismatch"). Never used on `undeployed`. |
| `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS`, `MIDNIGHT_NODE_HTTP` | Each replaces one URL verbatim; no token is added to it. With all three set, no Blockfrost token is needed on any network ID. |
| `MIDNIGHT_PROOF_SERVER_URL` (or `MIDNIGHT_PROOF_SERVER`) | Proof server URL. |
| `MIDNIGHT_WALLET_SEED` or `MIDNIGHT_WALLET_MNEMONIC` | Deploy wallet. Without either, `undeployed` uses the local genesis seed and other networks have no seed. |

Importing `midnight-env` (and therefore every entry point that imports it, including the package root, `deploy` and `wallet-info`) throws, naming the variables that fix it, when:

- `preview`, `preprod` or `mainnet` is selected, `MIDNIGHT_BLOCKFROST_PROJECT_ID` is unset, and at least one of the three URLs is left to its Blockfrost default;
- any other network ID is selected without all three URL overrides - there is no default to guess for it.

The overrides also keep other hosts usable, for example a self-hosted indexer and node:

```bash
MIDNIGHT_NETWORK_ID=preview
MIDNIGHT_INDEXER_HTTP=https://indexer.example.com/api/v4/graphql
MIDNIGHT_INDEXER_WS=wss://indexer.example.com/api/v4/graphql/ws
MIDNIGHT_NODE_HTTP=https://rpc.example.com
```

Blockfrost URLs embed the project token, so treat the resolved endpoints as secrets. The configuration errors above never quote a URL or the token, and the endpoint and failure lines printed by `deployMidnightContract` and the wallet-info CLI (`src/get-wallet-info-cli.ts`) show `project_id=<redacted>`. Pass anything you print yourself through `redactBlockfrostProjectId(text)`, which turns every `project_id=<token>` into `project_id=<redacted>`. Logs written by third-party clients (for example the wallet SDK's node connection) can still contain the full URL.

Wallet sync state saved against one indexer (for example with `saveDustState`) is not portable to another, so switching a wallet to Blockfrost means syncing it again from scratch.

## Inside Effectstream

`@effectstream/midnight-contracts` is the seam between Midnight contract artifacts on disk and the code that reads or deploys them. Templates that target Midnight call `readMidnightContract` from their node startup to resolve the on-chain address; the orchestrator's deploy step calls `deployMidnightContract` to put one there in the first place. On the sync side, `@effectstream/sync`'s `MidnightFetcher` consumes the node behind both calls.

## Key exports

`@effectstream/midnight-contracts/read-contract`:

- `readMidnightContract(name, options?)`: returns `{ contractAddress, contractInfo, zkConfigPath }`. `options.networkId` selects per-network files; `options.baseDir` overrides the search base.

`@effectstream/midnight-contracts/deploy`:

- `deployMidnightContract(config, networkUrls?)`: deploys and returns the address. Persists the address to a JSON file. Set `config.phasedVerifierKeys` for contracts whose circuits don't fit in a single deploy transaction.
- `deployMidnightContractPhased(...)`: the phased deploy routine `deployMidnightContract` delegates to when `phasedVerifierKeys` is set. Exported for advanced callers that already have built providers and a wallet.
- `DeployConfig`, `NetworkUrls`: input types.

Wallet and dust helpers, exported from the package root:

- `buildWalletFacade(...)`: builds the wallet facade the deploy and batcher paths run on.
- `registerNightForDust(...)`, `getInitialDustState(...)`: register NIGHT to generate dust and read the starting state.
- `waitForDustFunds(wallet, opts)` / `waitForDustFundsWithRetry(...)`: block until `dust.availableCoins` contains a spendable coin - a positive aggregate balance alone does not make a freshly funded wallet fee-ready.
- `saveDustState(...)` / `loadDustState(...)`: persist and restore dust state across restarts, avoiding a re-sync.
- `resolveFacadeDustBalance(...)`: current dust balance for a facade.

Other subpaths:

- `@effectstream/midnight-contracts/wallet-info` - wallet inspection plus the dust-state persistence helpers above, and `resolveWalletSyncTimeoutMs()`.
- `@effectstream/midnight-contracts/midnight-env` - `midnightNetworkConfig` (the resolved `{ id, indexer, indexerWS, node, proofServer, walletSeed }`, see [Network endpoints](#network-endpoints)), `MidnightNetworkConfig`, `defaultMidnightNetworkConfig(networkId, blockfrostProjectId?)` (the defaults for one network ID; the token defaults to `MIDNIGHT_BLOCKFROST_PROJECT_ID`), `redactBlockfrostProjectId(text)`, and `isExternalProofServerConfigured`.
- `@effectstream/midnight-contracts/ledger-from-tx-state` - `midnightLedgerFromTxStateHex(...)` and the `MidnightLedgerFn` / `MidnightContractStateDeserializer` types, for decoding contract ledger state from a serialized transaction state.
- `@effectstream/midnight-contracts/types` - shared types.

## Examples

End-to-end usage in templates:

- [`templates/evm-midnight-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)
- [`templates/zswap-da/`](https://github.com/effectstream/effectstream/tree/main/templates/zswap-da)

## Links

- Docs: https://effectstream.github.io/docs/packages/chains/midnight-contracts
- Source: https://github.com/effectstream/effectstream/tree/main/packages/chains/midnight-contracts
- Midnight: https://midnight.network
